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
  getContext = () => null,
  onPostCommitIssue = () => {},
}) {
  if (!store || typeof store.getState !== "function" || typeof store.replace !== "function") {
    throw new Error("commit-store-required");
  }
  if (typeof normalizeState !== "function") throw new Error("commit-normalize-required");
  if (typeof persistLocal !== "function") throw new Error("commit-local-persist-required");
  if (typeof enqueueCloud !== "function") throw new Error("commit-cloud-enqueue-required");
  let commitGeneration = 0;

  return (mutator, { updateUi } = {}) => {
    if (typeof mutator !== "function") throw new Error("commit-mutator-required");
    if (typeof updateUi !== "function") throw new Error("commit-ui-update-required");

    const draft = cloneState(store.getState());
    const result = mutator(draft);
    const normalizedState = normalizeState(result ?? draft);

    // Local persistence is the durability boundary. Do not show or enqueue a
    // mutation that could not first be saved on this device.
    persistLocal(normalizedState);
    const context = getContext();
    const generation = ++commitGeneration;
    const previousState = store.getState();
    let replaceError;
    try { store.replace(normalizedState); }
    catch (error) { replaceError = error; }
    // Store notification listeners may commit again or switch identity.
    if (generation !== commitGeneration || getContext() !== context) return store.getState();
    const committedState = store.getState();
    const isCurrent = () => getContext() === context && store.getState() === committedState;
    const report = (phase, error) => {
      if (!isCurrent()) return;
      // A post-save failure must not turn a successful write into a retryable
      // mutation failure. Report it separately, without swallowing durability errors.
      try { onPostCommitIssue({ phase, error, localSaved: true }); }
      catch (reportError) { console.warn("Post-commit notification failed.", reportError); }
    };
    if (replaceError) {
      report("store", replaceError);
      // A clone failure did not install the durable snapshot. Never enqueue the
      // previous state over it; reloading can recover the saved local snapshot.
      if (committedState === previousState) return committedState;
    }
    let uiError;
    try { updateUi(committedState); }
    catch (error) { uiError = error; }
    // A nested commit owns the newer snapshot; an auth change owns a new scope.
    if (isCurrent()) {
      try {
        const queued = enqueueCloud(committedState);
        Promise.resolve(queued).catch((error) => report("cloud", error));
      } catch (error) { report("cloud", error); }
    }
    if (uiError) report("ui", uiError);

    return store.getState();
  };
}
