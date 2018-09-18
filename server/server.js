const sqlite = require('sqlite')
const log = require('./lib/logger')(`server[${process.pid}]`)
const path = require('path')
const config = require('../project.config')
const getIPAddress = require('./lib/getIPAddress')
const http = require('http')
const fs = require('fs')
const { promisify } = require('util')
const parseCookie = require('./lib/parseCookie')
const jwtVerify = require('jsonwebtoken').verify
const Koa = require('koa')
const KoaBodyparser = require('koa-bodyparser')
const KoaRange = require('koa-range')
const KoaLogger = require('koa-logger')
const KoaStatic = require('koa-static')
const app = new Koa()

const Prefs = require('./Prefs')
const Library = require('./Library')
const libraryRouter = require('./Library/router')
const mediaRouter = require('./Media/router')
const prefsRouter = require('./Prefs/router')
const roomsRouter = require('./Rooms/router')
const userRouter = require('./User/router')

const SocketIO = require('socket.io')
const socketActions = require('./socket')
const {
  LIBRARY_PUSH,
  SCANNER_WORKER_DONE,
  SERVER_WORKER_STATUS,
  SERVER_WORKER_ERROR,
} = require('../shared/actions')

// Koa error handling
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    ctx.status = err.status || 500
    ctx.body = err.message
    ctx.app.emit('error', err, ctx)
  }
})

app.on('error', (err, ctx) => {
  if (err.code === 'EPIPE') {
    // these are common since browsers make multiple requests for media files
    log.verbose(err.message)
    return
  }

  log.error(err.message)
})

log.info('Opening database file %s', config.database)

Promise.resolve()
  .then(() => sqlite.open(config.database, { Promise }))
  .then(db => db.migrate({
    migrationsPath: path.join(config.basePath, 'server', 'lib', 'schemas'),
    // force: 'last' ,
  }))
  .then(() => Prefs.getJwtKey())
  .then(jwtKey => {
    // koa request/response logging
    app.use(KoaLogger((str, args) => {
      if (args.length === 6 && args[3] >= 500) {
        // 5xx status response
        log.error(str)
      } else {
        log.verbose(str)
      }
    }))

    app.use(KoaRange)
    app.use(KoaBodyparser())

    // all http (koa) requests
    app.use(async (ctx, next) => {
      ctx.io = io
      ctx.jwtKey = jwtKey

      // verify jwt
      try {
        const { kfToken } = parseCookie(ctx.request.header.cookie)
        ctx.user = jwtVerify(kfToken, jwtKey)
      } catch (err) {
        ctx.user = {
          userId: null,
          username: null,
          name: null,
          isAdmin: false,
          roomId: null,
        }
      }

      await next()
    })

    // http api (koa-router) endpoints
    app.use(libraryRouter.routes())
    app.use(mediaRouter.routes())
    app.use(prefsRouter.routes())
    app.use(roomsRouter.routes())
    app.use(userRouter.routes())

    if (config.env === 'development') {
      log.info('Enabling webpack dev and HMR middleware')
      const webpack = require('webpack')
      const webpackConfig = require('../webpack.config')
      const compiler = webpack(webpackConfig)
      const KoaWebpack = require('koa-webpack')

      KoaWebpack({ compiler })
        .then((middleware) => {
          // webpack-dev-middleware and webpack-hot-client
          app.use(middleware)

          // serve static assets from ~/public since Webpack is unaware of these
          app.use(KoaStatic(path.resolve(config.basePath, 'public')))

          // "rewrite" other requests to the root /index.html file
          // (which webpack-dev-server will serve from a virtual ~/dist)
          const indexFile = path.join(config.basePath, 'dist', 'index.html')

          app.use(async (ctx, next) => {
            ctx.body = await new Promise(function (resolve, reject) {
              compiler.outputFileSystem.readFile(indexFile, (err, result) => {
                if (err) { return reject(err) }
                return resolve(result)
              })
            })
            ctx.set('content-type', 'text/html')
            ctx.status = 200
          })
        })
    } else {
      // production mode

      // serve files in ~/dist
      app.use(KoaStatic(path.join(config.basePath, 'dist')))

      // "rewrite" all other requests to the root /index.html file
      const indexFile = path.join(config.basePath, 'dist', 'index.html')
      const readFile = promisify(fs.readFile)

      app.use(async (ctx, next) => {
        ctx.body = await readFile(indexFile)
        ctx.set('content-type', 'text/html')
        ctx.status = 200
      })
    }

    // create http and socket.io server
    const server = http.createServer(app.callback())
    const io = new SocketIO(server)

    // http server error handler
    server.on('error', function (err) {
      log.error(err)

      process.send({
        'type': SERVER_WORKER_ERROR,
        'error': err.message,
      })

      // not much we can do without a working server
      process.exit(1)
    })

    // socket.io event handlers
    socketActions(io, jwtKey)

    // emit messages from scanner over socket.io
    process.on('message', async function (action) {
      io.emit('action', action)

      // emit library when scanner finishes/exits
      if (action.type === SCANNER_WORKER_DONE) {
        io.emit('action', {
          type: LIBRARY_PUSH,
          payload: await Library.get(),
        })
      }
    })

    log.info(`Starting web server (host=${config.serverHost}; port=${config.serverPort})`)

    // success callback is added as a listener for the 'listening' event
    server.listen(config.serverPort, config.serverHost, () => {
      const url = `http://${getIPAddress()}:${config.serverPort}`
      log.info(`Web server running at ${url}`)

      process.send({
        'type': SERVER_WORKER_STATUS,
        'payload': { url },
      })
    })
  })
