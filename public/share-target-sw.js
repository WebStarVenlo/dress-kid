/*
 * Dress Kid: "Delen → Dress Kid" (Web Share Target, Android).
 *
 * De gegenereerde service worker (sw.js) laadt dit script met importScripts. Het vangt de POST naar
 * ./share-target af (zie share_target in het manifest), bewaart de gedeelde foto's in een eigen kleine
 * IndexedDB ('dress-kid-share', store 'pending') en stuurt door naar het ouderscherm. De app haalt de
 * foto's daar op na het ouderslot (src/domain/sharedPhotos.ts, met hetzelfde formaat).
 *
 * Bewust gewoon JavaScript zonder bundler of imports. De functies staan ook op
 * self.dressKidShareTarget, zodat ze los te testen zijn.
 */
;(function (scope) {
  'use strict'

  var DB_NAME = 'dress-kid-share'
  var DB_VERSION = 1
  var STORE = 'pending'
  /** Pad van share_target.action, relatief aan de scope. */
  var ACTION = 'share-target'
  /** Waarheen na het delen, relatief aan de scope (HashRouter). */
  var REDIRECT = './#/ouder?gedeeld=1'
  var MAX_FILES = 10
  var MAX_BYTES = 10 * 1024 * 1024

  /** Is dit de POST van het deelmenu? */
  function isShareTarget(method, url, scopeUrl) {
    if (String(method).toUpperCase() !== 'POST') return false
    var target = new URL(ACTION, scopeUrl)
    var actual = new URL(url)
    return actual.origin === target.origin && actual.pathname === target.pathname
  }

  function isImage(file) {
    return typeof file.type === 'string' && file.type.toLowerCase().indexOf('image/') === 0
  }

  /** Eerste http(s)-link uit url of tekst (Chrome zet de paginalink vaak in 'text'). */
  function findLink(url, text) {
    var candidates = [url].concat(String(text || '').split(/\s+/))
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i]
      if (typeof value !== 'string' || value === '') continue
      try {
        var parsed = new URL(value)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
      } catch (error) {
        // geen link
      }
    }
    return undefined
  }

  /**
   * Kiest uit het formulier wat bewaard wordt: hooguit MAX_FILES afbeeldingen van hooguit MAX_BYTES.
   * Alleen zonder foto's wordt een gedeelde link onthouden.
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

  /** Vervangt wat er nog klaarstond door deze deling (bytes als ArrayBuffer, net als de hoofdopslag). */
  async function savePending(idb, share, now) {
    var sharedAt = now === undefined ? Date.now() : now
    var records = []
    for (var i = 0; i < share.files.length; i++) {
      var file = share.files[i]
      records.push({ kind: 'photo', name: file.name || 'gedeeld', type: file.type, data: await readBytes(file), sharedAt: sharedAt })
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

  /** Verwerkt de deling en stuurt altijd door naar het ouderscherm, ook als bewaren mislukt. */
  async function handleShare(request, scopeUrl, idb) {
    try {
      var share = collectShare(await request.formData())
      await savePending(idb, share)
    } catch (error) {
      console.error('Dress Kid: gedeelde foto bewaren mislukt', error)
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

  // Alleen in de echte service worker. Deze listener staat vóór die van Workbox (importScripts komt
  // eerst) en Workbox behandelt alleen GET, dus de POST wordt niet door precache of fallback geslikt.
  if (scope.registration && typeof scope.addEventListener === 'function') {
    scope.addEventListener('fetch', function (event) {
      var request = event.request
      if (!isShareTarget(request.method, request.url, scope.registration.scope)) return
      event.respondWith(handleShare(request, scope.registration.scope, scope.indexedDB))
    })
  }
})(self)
