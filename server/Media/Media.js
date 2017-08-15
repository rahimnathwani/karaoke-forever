const db = require('sqlite')
const squel = require('squel')
const debug = require('debug')
const log = debug('app:media')

class Media {
  static async getLibrary () {
    const artists = {
      result: [],
      entities: {}
    }
    const media = {
      result: [],
      entities: {}
    }

    // First query: artists
    try {
      const q = squel.select()
        .from('artists')
        .order('name')

      // log(q.toString())
      const { text, values } = q.toParam()
      const rows = await db.all(text, values)

      // normalize results
      for (const row of rows) {
        artists.result.push(row.artistId)
        artists.entities[row.artistId] = row
        // prep LUT for mediaIds
        artists.entities[row.artistId].mediaIds = []
      }
    } catch (err) {
      log(err.message)
      return Promise.reject(err)
    }

    // Second query: media/songs
    try {
      const q = squel.select()
        .field('media.mediaId, media.title, media.duration, media.artistId')
        .field('artists.name AS artist')
        // .field('MAX(media.isPreferred) AS isPreferred')
        .field('COUNT(*) AS numMedia')
        .field('COUNT(stars.userId) AS numStars')
        .from('media')
        .join(squel.select()
          .from('providers')
          .where('providers.isEnabled = 1')
          .order('priority'),
        'providers', 'media.provider = providers.name')
        .join('artists USING (artistId)')
        .left_join('stars USING(mediaId)')
        .group('artistId')
        .group('title')
        .order('artists.name')
        .order('media.title')

      const { text, values } = q.toParam()
      const rows = await db.all(text, values)

      for (const row of rows) {
        // add mediaId to artist's LUT
        artists.entities[row.artistId].mediaIds.push(row.mediaId)

        media.result.push(row.mediaId)
        media.entities[row.mediaId] = row
      }
    } catch (err) {
      return Promise.reject(err)
    }

    return { artists, media }
  }

  static async getMedia (fields) {
  }

  static async add (media) {
    if (!media.artist || !media.title || !media.duration || !media.provider) {
      return Promise.reject(new Error('Invalid media data: ' + JSON.stringify(media)))
    }

    // does the artist already exist?
    let row

    try {
      const q = squel.select()
        .from('artists')
        .where('name = ?', media.artist)

      const { text, values } = q.toParam()
      row = await db.get(text, values)
    } catch (err) {
      return Promise.reject(err)
    }

    if (row) {
      log('matched artist: %s', row.name)
      media.artistId = row.artistId
    } else {
      log('new artist: %s', media.artist)

      try {
        const q = squel.insert()
          .into('artists')
          .set('name', media.artist)

        const { text, values } = q.toParam()
        const res = await db.run(text, values)

        if (!Number.isInteger(res.stmt.lastID)) {
          throw new Error('invalid lastID after artist insert')
        }

        media.artistId = res.stmt.lastID
      } catch (err) {
        return Promise.reject(err)
      }
    }

    // prep for insert; we have the artistId now
    delete media.artist
    media.duration = Math.round(media.duration)
    media.providerData = JSON.stringify(media.providerData || {})

    try {
      const q = squel.insert()
        .into('media')

      Object.keys(media).forEach(key => {
        q.set(key, media[key])
      })

      const { text, values } = q.toParam()
      const res = await db.run(text, values)

      if (!Number.isInteger(res.stmt.lastID)) {
        throw new Error('got invalid lastID after song insert')
      }

      // return mediaId
      return Promise.resolve(res.stmt.lastID)
    } catch (err) {
      log(err)
      return Promise.reject(err)
    }
  }
}

module.exports = Media