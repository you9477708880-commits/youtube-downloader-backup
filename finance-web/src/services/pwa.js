export function setupPWA() {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = new URL("../../manifest.webmanifest", import.meta.url).href;
    document.head.appendChild(manifestLink);
  }

  if (!("serviceWorker" in navigator)) return;

  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    globalThis.caches?.keys?.().then((keys) => {
      keys.forEach((key) => globalThis.caches.delete(key));
    });
    return;
  }

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  navigator.serviceWorker
    .register(new URL("../../sw.js", import.meta.url), { scope: "/" })
    .then((registration) => registration.update())
    .catch((error) => console.warn("SW failed:", error));
}
