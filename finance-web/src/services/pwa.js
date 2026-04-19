export function setupPWA() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
  const manifest = {
    name: "理財計算 Pro",
    short_name: "記帳Pro",
    start_url: location.href,
    display: "standalone",
    background_color: "#f4f4f4",
    theme_color: "#00796b",
    icons: [
      {
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2300796b'/%3E%3Ctext x='50' y='65' font-size='50' fill='white' text-anchor='middle' font-family='sans-serif'%3E$%3C/text%3E%3C/svg%3E",
        sizes: "192x192",
        type: "image/svg+xml",
      },
    ],
  };

  document.head.insertAdjacentHTML(
    "beforeend",
    `<link rel="manifest" href="${URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }))}">`,
  );

  if (!("serviceWorker" in navigator)) return;

  // During local development, stale cache is much more harmful than helpful.
  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    return;
  }

  const swCode = `
    const CACHE_NAME = "finance-app-v4";
    self.addEventListener("install", (event) => {
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([location.href])));
      self.skipWaiting();
    });
    self.addEventListener("activate", (event) => {
      event.waitUntil(self.clients.claim());
    });
    self.addEventListener("fetch", (event) => {
      event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
    });
  `;

  navigator.serviceWorker
    .register(URL.createObjectURL(new Blob([swCode], { type: "application/javascript" })))
    .catch((error) => console.warn("SW failed:", error));
}
