import { cloneState } from "../state/initial-state.js";

export function createScopedLocalPersist({ getScope, setScope, defaultScope, persist }) {
  if (typeof getScope !== "function" || typeof setScope !== "function" || typeof persist !== "function" || !defaultScope) {
    throw new Error("scoped-local-persist-config-required");
  }

  return (state) => {
    const currentScope = getScope();
    const targetScope = currentScope || defaultScope;
    persist(state, targetScope);
    if (!currentScope) setScope(targetScope);
  };
}

export function createCommitState({
  store,
  normalizeState,
  persistLocal,
  enqueueCloud,
}) {
  if (!store || typeof store.getState !== "function" || typeof store.replace !== "function") {
    throw new Error("commit-store-required");
  }
  if (typeof normalizeState !== "function") throw new Error("commit-normalize-required");
  if (typeof persistLocal !== "function") throw new Error("commit-local-persist-required");
  if (typeof enqueueCloud !== "function") throw new Error("commit-cloud-enqueue-required");

  return (mutator, { updateUi } = {}) => {
    if (typeof mutator !== "function") throw new Error("commit-mutator-required");
    if (typeof updateUi !== "function") throw new Error("commit-ui-update-required");

    const draft = cloneState(store.getState());
    const result = mutator(draft);
    const normalizedState = normalizeState(result ?? draft);

    // Local persistence is the durability boundary. Do not show or enqueue a
    // mutation that could not first be saved on this device.
    persistLocal(normalizedState);
    store.replace(normalizedState);
    updateUi(store.getState());
    enqueueCloud(store.getState());

    return store.getState();
  };
}
