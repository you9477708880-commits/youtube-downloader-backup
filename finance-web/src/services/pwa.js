const PWA_VERSION = "finance-app-v5";

export function setupPWA() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
  const manifest = {
    name: "理財計算 Pro",
    short_name: "記帳Pro",
    start_url: location.pathname,
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

  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    caches?.keys?.().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
    return;
  }

  const swCode = `
    const CACHE_NAME = "${PWA_VERSION}";
    const STATIC_CACHE = "static-" + CACHE_NAME;
    const PAGE_CACHE = "pages-" + CACHE_NAME;

    self.addEventListener("install", (event) => {
      event.waitUntil(self.skipWaiting());
    });

    self.addEventListener("activate", (event) => {
      event.waitUntil(
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ).then(() => self.clients.claim()),
      );
    });

    async function networkFirst(request) {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw error;
      }
    }

    async function staleWhileRevalidate(request) {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      return cached || fetchPromise || fetch(request);
    }

    self.addEventListener("fetch", (event) => {
      const { request } = event;
      if (request.method !== "GET") return;

      const url = new URL(request.url);
      if (url.origin !== self.location.origin) return;

      const isNavigation = request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
      if (isNavigation) {
        event.respondWith(networkFirst(request));
        return;
      }

      const isStaticAsset = /\\.(css|js|png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i.test(url.pathname);
      if (isStaticAsset) {
        event.respondWith(staleWhileRevalidate(request));
      }
    });
  `;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  navigator.serviceWorker
    .register(URL.createObjectURL(new Blob([swCode], { type: "application/javascript" })))
    .then((registration) => registration.update())
    .catch((error) => console.warn("SW failed:", error));
}
