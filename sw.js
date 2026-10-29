// ASFE Store — funciona offline depois da primeira visita.
const VERSION = "asfe-v1";
const SHELL = ["./", "./index.html", "./games.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "asfe-img").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Página e lista de jogos: busca a versão nova primeiro e usa a guardada se estiver sem internet
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./"))));
    return;
  }
  // Capas, fontes e lista de capas da Wikipédia: usa a guardada e atualiza por trás
  if (/wikipedia\.org|wikimedia\.org|fonts\.(googleapis|gstatic)\.com|i\.ytimg\.com/.test(url.hostname)) {
    e.respondWith(caches.open("asfe-img").then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
