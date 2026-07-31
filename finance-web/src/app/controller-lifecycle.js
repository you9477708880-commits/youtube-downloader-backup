export function createWholeStateReplacer({ store, controllers = [] }) {
  if (!store || typeof store.replace !== "function") {
    throw new Error("store-replace-required");
  }
  if (controllers.some((controller) => !controller || typeof controller.reset !== "function")) {
    throw new Error("controller-reset-required");
  }

  return (nextState) => {
    controllers.forEach((controller) => controller.reset());
    store.replace(nextState);
  };
}
