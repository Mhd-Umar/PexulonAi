/* ToolNest service worker: app shell cached up front, everything else cached the first time it is used. */
const V = 'toolnest-v8', SHELL = ['./', 'index.html', 'CSS/app.css', 'js/app.js', 'js/config.js', 'js/logic.js', 'js/qr.js', 'js/pdf-edit-core.js', 'js/tools/calc-tools.js', 'js/tools/electronics-tools.js', 'js/tools/text-tools.js', 'js/tools/dev-tools.js', 'js/tools/security-tools.js', 'js/tools/image-tools.js', 'js/tools/pdf-tools.js', 'js/tools/pdf-editor.js', 'js/tools/ai-tools.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url); if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/')) return;
  const own = /\.(js|css|html|webmanifest)$/.test(u.pathname) && !u.pathname.includes('/lib/');
  e.respondWith(own // network first for our own code so updates show up; cache first for big libraries
    ? fetch(r).then(res => { const c = res.clone(); caches.open(V).then(ch => ch.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html')))
    : caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ch => ch.put(r, c)); } return res; })));
});
