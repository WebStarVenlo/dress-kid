/*
 * Dress Kid: "Share → Dress Kid" (Web Share Target, Android).
 *
 * The generated service worker (sw.js) loads this script with importScripts. It catches the POST to
 * ./share-target (see share_target in the manifest), stores the shared photos in its own small
 * IndexedDB ('dress-kid-share', store 'pending') and redirects to the parent screen. The app fetches
 * the photos from there after the parent lock (src/domain/sharedPhotos.ts, with the same format).
 *
 * Deliberately plain JavaScript without a bundler or imports. The functions are also exposed on
 * self.dressKidShareTarget so they can be tested in isolation.
 */
;(function (scope) {
  'use strict'

  var DB_NAME = 'dress-kid-share'
  var DB_VERSION = 1
  var STORE = 'pending'
  /** Path of share_target.action, relative to the scope. */
  var ACTION = 'share-target'
  /** Where to go after sharing, relative to the scope (HashRouter). */
  var REDIRECT = './#/parent?shared=1'
  var MAX_FILES = 10
  var MAX_BYTES = 10 * 1024 * 1024

  /** Is this the POST from the share sheet? */
  function isShareTarget(method, url, scopeUrl) {
    if (String(method).toUpperCase() !== 'POST') return false
    var target = new URL(ACTION, scopeUrl)
    var actual = new URL(url)
    return actual.origin === target.origin && actual.pathname === target.pathname
  }

  function isImage(file) {
    return typeof file.type === 'string' && file.type.toLowerCase().indexOf('image/') === 0
  }

  /** First http(s) link in url or text (Chrome often puts the page link in 'text'). */
  function findLink(url, text) {
    var candidates = [url].concat(String(text || '').split(/\s+/))
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i]
      if (typeof value !== 'string' || value === '') continue
      try {
        var parsed = new URL(value)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
      } catch (error) {
        // not a link
      }
    }
    return undefined
  }

  /**
   * Picks from the form what gets stored: at most MAX_FILES images of at most MAX_BYTES each.
   * A shared link is only kept when there are no photos.
   */
  function collectShare(formData) {
    var files = []
    var entries = formData.getAll('photos')
    for (var i = 0; i < entries.length && files.length < MAX_FILES; i++) {
      var entry = entries[i]
      if (!entry || typeof entry === 'string') continue
      if (!isImage(entry) || entry.size <= 0 || entry.size > MAX_BYTES) continue
      files.push(entry)
    }
    var text = formData.get('text')
    var url = formData.get('url')
    var link = files.length === 0 ? findLink(typeof url === 'string' ? url : '', typeof text === 'string' ? text : '') : undefined
    return { files: files, link: link }
  }

  function readBytes(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
    return new Response(file).arrayBuffer()
  }

  function openDb(idb) {
    return new Promise(function (resolve, reject) {
      var request = idb.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = function () {
        var db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true })
      }
      request.onsuccess = function () {
        resolve(request.result)
      }
      request.onerror = function () {
        reject(request.error)
      }
    })
  }

  /** Replaces whatever was still waiting with this share (bytes as ArrayBuffer, like the main store). */
  async function savePending(idb, share, now) {
    var sharedAt = now === undefined ? Date.now() : now
    var records = []
    for (var i = 0; i < share.files.length; i++) {
      var file = share.files[i]
      records.push({ kind: 'photo', name: file.name || 'shared', type: file.type, data: await readBytes(file), sharedAt: sharedAt })
    }
    if (share.link) records.push({ kind: 'link', url: share.link, sharedAt: sharedAt })

    var db = await openDb(idb)
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite')
        var store = tx.objectStore(STORE)
        store.clear()
        for (var j = 0; j < records.length; j++) store.add(records[j])
        tx.oncomplete = function () {
          resolve(undefined)
        }
        tx.onerror = function () {
          reject(tx.error)
        }
        tx.onabort = function () {
          reject(tx.error)
        }
      })
    } finally {
      db.close()
    }
    return records.length
  }

  /** Handles the share and always redirects to the parent screen, even if saving fails. */
  async function handleShare(request, scopeUrl, idb) {
    try {
      var share = collectShare(await request.formData())
      await savePending(idb, share)
    } catch (error) {
      console.error('Dress Kid: failed to store shared photo', error)
    }
    return Response.redirect(new URL(REDIRECT, scopeUrl).href, 303)
  }

  scope.dressKidShareTarget = {
    DB_NAME: DB_NAME,
    STORE: STORE,
    MAX_FILES: MAX_FILES,
    MAX_BYTES: MAX_BYTES,
    isShareTarget: isShareTarget,
    collectShare: collectShare,
    savePending: savePending,
    handleShare: handleShare,
  }

  // Only in the real service worker. This listener is registered before Workbox's (importScripts runs
  // first) and Workbox only handles GET, so the POST is not swallowed by precache or the fallback.
  if (scope.registration && typeof scope.addEventListener === 'function') {
    scope.addEventListener('fetch', function (event) {
      var request = event.request
      if (!isShareTarget(request.method, request.url, scope.registration.scope)) return
      event.respondWith(handleShare(request, scope.registration.scope, scope.indexedDB))
    })
  }
})(self)
