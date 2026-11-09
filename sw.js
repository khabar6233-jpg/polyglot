// Работа без интернета: приложение и уроки сохраняются на телефоне.
// После обновления сайта поменяйте VERSION — тогда телефон скачает новые файлы.
const VERSION = "polyglot-v3";
const FILES = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "js/app.js", "js/engine.js", "js/storage.js", "js/teacher.js",
  "lessons/index.json", "lessons/lesson01.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала берём из сети (чтобы видеть обновления), без сети — из сохранённого.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // запросы к Gemini не трогаем
  // no-cache: браузер обязательно сверяется с сайтом, а не берёт старый файл из своего кэша.
  const fresh = e.request.mode === "navigate" ? fetch(e.request) : fetch(e.request, { cache: "no-cache" });
  e.respondWith(
    fresh
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
