const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/modeler3d.css',
  './lib/quagga.min.js',
  './lib/three.module.js',
  './lib/three.global.js',
  './lib/jszip.min.js',
  './lib/codemirror/lib/codemirror.js',
  './lib/codemirror/lib/codemirror.css',
  './lib/codemirror/mode/javascript/javascript.js',
  './js/db.js',
  './js/utils.js',
  './js/modulehost.js',
  './js/flip.js',
  './js/botoeslayout.js',
  './js/camcontrol3d.js',
  './js/eventlog.js',
  './js/icons.js',
  './js/objimport.js',
  './js/devicefingerprint.js',
  './js/session.js',
  './js/geo.js',
  './js/perf.js',
  './js/history.js',
  './js/avatar.js',
  './js/barcode.js',
  './js/libloader.js',
  './js/mapping.js',
  './js/organizeview.js',
  './js/ambientephotos.js',
  './js/model3dloader.js',
  './js/glbmeshsource.js',
  './js/objmeshsource.js',
  './js/objectassets.js',
  './assets/js/mostrador-canvas.js',
  './js/engine3d-profiles.js',
  './js/objcategorias.js',
  './js/novosobjetos.js',
  './assets/modelos/js/_novos-objetos.js',
  './js/rack-modular.js',
  './js/rede-passiva.js',
  './js/rede-docs.js',
  './js/rede-equip.js',
  './js/rede-storage-energia.js',
  './js/patch-cord.js',
  './js/maptxt.js',
  './js/engine3d.js',
  './js/modeler/modeler-mesh.js',
  './js/modeler/modeler-gizmo.js',
  './js/modeler/modeler-render.js',
  './js/modeler/modeler-input.js',
  './js/modeler/modeler-ui.js',
  './js/modeler/modeler-core.js',
  './js/email.js',
  './js/autosave.js',
  './js/sync.js',
  './js/autoexport.js',
  './js/serverprefs.js',
  './js/p2p.js',
  './js/localbackup.js',
  './js/storagestatus.js',
  './js/table.js',
  './js/flashcards.js',
  './js/capture.js',
  './js/mapconfig.js',
  './js/mapselection.js',
  './js/mapview.js',
  './js/photogrid.js',
  './js/view3d.js',
  './js/view3d-rede.js',
  './js/modelos3d.js',
  './js/search.js',
  './js/verlistasimples.js',
  './js/exportdeps.js',
  './js/settings.js',
  './js/unify.js',
  './js/app.js',
  './js/cards/cards.css',
  './js/cards/object-card.js',
  './js/cards/foto-pin-card.js',
  './js/cards/tijolo-aglomerado-card.js',
  './js/cards/orphan-patrimonio-card.js',
  './js/cards/confirm-card.js',
  './js/cards/importar-objeto-card.js',
  './js/cards/object-panel-card.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(APP_SHELL.map((url) => fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res)))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = isSameOrigin && (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html'));
  if (isNavigation) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))),
    );
  } else if (isSameOrigin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req)),
    );
  }
});
const CACHE_VERSION = 'catalogo-v662';
