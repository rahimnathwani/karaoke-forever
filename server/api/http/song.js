const db = require('sqlite')
const KoaRouter = require('koa-router')
const router = KoaRouter()
const debug = require('debug')
const log = debug('app:api:song')
const searchLibrary = require('../../library/search')

router.get('/api/song/:songId', async (ctx, next) => {
  const { songId } = ctx.params

  try {
    let res = await searchLibrary({ songId })

    if (res.result.length === 1) {
      const row = res.entities[res.result[0]]
      const provider_data = JSON.parse(row.provider_json)
      const song = Object.assign({}, row, provider_data)
      delete song.provider_json

      ctx.body = song
    } else {
      ctx.status = 404
    }
  } catch(err) {
    log(err)
    ctx.status = 500
    return ctx.body = err.message
  }
})

module.exports = router