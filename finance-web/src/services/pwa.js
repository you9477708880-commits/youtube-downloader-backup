import { getFinanceRuntime } from "../config/runtime.js";

function clearLocalPwaState(navigatorRef, cachesRef) {
  const registrations = navigatorRef?.serviceWorker?.getRegistrations?.().then((items) => {
    items.forEach((registration) => registration.unregister());
  });
  const cacheClear = cachesRef?.keys?.().then((keys) => {
    keys.forEach((key) => cachesRef.delete(key));
  });
  return Promise.all([registrations, cacheClear].filter(Boolean));
}

function createUpdateView(doc) {
  const banner = doc?.getElementById?.("pwa-update-banner");
  const updateNow = doc?.getElementById?.("pwa-update-now");
  const updateLater = doc?.getElementById?.("pwa-update-later");
  if (!banner || !updateNow || !updateLater) return null;
  return { banner, updateNow, updateLater };
}

export function setupPWA(doc = globalThis.document, {
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  cachesRef = globalThis.caches,
} = {}) {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(locationRef?.hostname);
  const runtime = getFinanceRuntime();

  if (!runtime.pwaEnabled) {
    return clearLocalPwaState(navigatorRef, cachesRef);
  }

  if (!doc.querySelector('link[rel="manifest"]')) {
    const manifestLink = doc.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = new URL("../../manifest.webmanifest", import.meta.url).href;
    doc.head.appendChild(manifestLink);
  }

  if (!navigatorRef?.serviceWorker) return Promise.resolve(null);

  if (isLocalhost) {
    return clearLocalPwaState(navigatorRef, cachesRef);
  }

  const view = createUpdateView(doc);
  let registrationRef = null;
  let waitingWorker = null;
  let reloadRequested = false;
  let reloading = false;

  const hideUpdate = () => view?.banner.classList.add("d-none");
  const showUpdate = (worker) => {
    if (!view || !worker) return;
    waitingWorker = worker;
    view.updateNow.disabled = false;
    view.updateNow.textContent = "立即更新";
    view.banner.classList.remove("d-none");
  };

  view?.updateLater.addEventListener("click", hideUpdate);
  view?.updateNow.addEventListener("click", () => {
    const worker = registrationRef?.waiting || waitingWorker;
    if (!worker) return;
    reloadRequested = true;
    view.updateNow.disabled = true;
    view.updateNow.textContent = "正在更新…";
    worker.postMessage({ type: "FINANCE_SKIP_WAITING" });
  });

  navigatorRef.serviceWorker.addEventListener?.("controllerchange", () => {
    if (!reloadRequested || reloading) return;
    reloading = true;
    locationRef.reload();
  });
  navigatorRef.serviceWorker.addEventListener?.("message", (event) => {
    if (event.data?.type === "FINANCE_UPDATE_AVAILABLE") {
      showUpdate(registrationRef?.waiting || registrationRef?.installing);
    }
  });

  return navigatorRef.serviceWorker
    .register(new URL("../../sw.js", import.meta.url), { scope: "/" })
    .then((registration) => {
      registrationRef = registration;
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener?.("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener?.("statechange", () => {
          if (worker.state === "installed" && registration.active) showUpdate(worker);
        });
      });
      return registration.update().then(() => registration);
    })
    .catch((error) => {
      console.warn("SW failed:", error);
      return null;
    });
}
