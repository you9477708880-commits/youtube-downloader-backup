function createFallbackCloudSync() {
  return {
    enabled: false,
    error: "",
    save: async () => {},
    resolveConflict: async () => false,
    signInWithGoogle: async () => false,
    signOutToAnonymous: async () => ({ mode: "local" }),
    getUser: () => null,
  };
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new Error(`sync-coordinator-${name}-required`);
}

export function createSyncCoordinator({
  store,
  createBaseState,
  cloneState,
  localScopeDefault,
  userStorageScope,
  loadLocalState,
  saveLocalState,
  normalizeState,
  hasMeaningfulData,
  areStatesEquivalent,
  buildConflictMessage,
  promptSyncChoice,
  confirmUnboundImport,
  preserveRollback,
  schedule = (callback) => setTimeout(callback, 0),
  refreshStateUi = () => {},
  onStatus = () => {},
  onNotify = () => {},
  onWarn = () => {},
  onAuthViewChange = () => {},
} = {}) {
  if (!store || typeof store.getState !== "function") throw new Error("sync-coordinator-store-required");
  assertFunction(createBaseState, "base-state");
  assertFunction(cloneState, "clone-state");
  if (!localScopeDefault) throw new Error("sync-coordinator-local-scope-required");
  assertFunction(userStorageScope, "user-scope");
  assertFunction(loadLocalState, "local-load");
  assertFunction(saveLocalState, "local-save");
  assertFunction(normalizeState, "normalize");
  assertFunction(hasMeaningfulData, "meaningful-data");
  assertFunction(areStatesEquivalent, "state-equivalence");
  assertFunction(buildConflictMessage, "conflict-message");
  assertFunction(promptSyncChoice, "conflict-prompt");
  assertFunction(confirmUnboundImport, "unbound-import-confirm");
  assertFunction(preserveRollback, "rollback");
  assertFunction(schedule, "schedule");

  let cloudSync = createFallbackCloudSync();
  let replaceWholeState = null;
  let currentUser = null;
  let authAction = null;
  let localScope = null;
  let pendingUnboundLocalState = null;
  let cloudConflictDecision = "";
  let cloudConflictUserId = "";

  const requireReplacer = () => {
    if (!replaceWholeState) throw new Error("sync-coordinator-replacer-not-bound");
    return replaceWholeState;
  };

  const emitAuthView = () => {
    onAuthViewChange({
      user: currentUser,
      action: authAction,
      cloudEnabled: Boolean(cloudSync.enabled),
      error: cloudSync.error || "",
    });
  };

  const runScheduled = (callback) => {
    schedule(() => {
      Promise.resolve()
        .then(callback)
        .catch((error) => onWarn("Scheduled sync action failed.", error));
    });
  };

  const makeCompleteState = (state) => {
    const base = createBaseState();
    return normalizeState({
      ...base,
      ...(state || {}),
      settings: { ...base.settings, ...((state || {}).settings || {}) },
    });
  };

  const applyRemoteState = (remoteState) => {
    requireReplacer()(makeCompleteState(remoteState));
    if (localScope) saveLocalState(store.getState(), localScope);
    refreshStateUi(store.getState());
  };

  const persistCommittedLocalState = (state) => {
    const targetScope = localScope || localScopeDefault;
    saveLocalState(state, targetScope);
    if (!localScope) localScope = targetScope;
    return targetScope;
  };

  const enqueueCloudState = () => {
    if (
      !cloudSync.enabled ||
      !currentUser ||
      currentUser.isAnonymous ||
      ["cancel", "pending"].includes(cloudConflictDecision)
    ) {
      return Promise.resolve(false);
    }

    return Promise.resolve(cloudSync.save()).then(
      (saved) => saved !== false,
      (error) => {
        onWarn("Cloud save failed.", error);
        onStatus("error");
        return false;
      },
    );
  };

  const requestCloudSave = () => {
    runScheduled(() => enqueueCloudState());
  };

  const switchLocalScope = (user) => {
    const replacer = requireReplacer();
    const previousScope = localScope;
    if (previousScope) saveLocalState(store.getState(), previousScope);

    const nextScope = user && !user.isAnonymous
      ? userStorageScope(user.uid)
      : localScopeDefault;

    if (
      previousScope === localScopeDefault &&
      nextScope !== localScopeDefault &&
      hasMeaningfulData(store.getState())
    ) {
      pendingUnboundLocalState = cloneState(store.getState());
    } else if (nextScope === localScopeDefault) {
      pendingUnboundLocalState = null;
    }

    localScope = nextScope;
    replacer(loadLocalState(createBaseState(), localScope));
    refreshStateUi(store.getState());
  };

  const onUserChange = (user) => {
    currentUser = user || null;
    switchLocalScope(currentUser);

    const nextConflictUserId = currentUser && !currentUser.isAnonymous ? currentUser.uid : "";
    if (nextConflictUserId !== cloudConflictUserId) {
      cloudConflictDecision = "";
      cloudConflictUserId = nextConflictUserId;
    }
    emitAuthView();
  };

  const onConflict = async ({ localState, remoteState, keys = [] }) => {
    const requestedChoice = await promptSyncChoice({
      type: "record-conflict",
      keys: [...keys],
      message: `${keys.length} cloud record conflict(s). Choose cloud, local, or cancel.`,
      user: currentUser,
    });
    const choice = ["cloud", "local"].includes(requestedChoice) ? requestedChoice : "cancel";

    if (choice === "cloud" && !preserveRollback(localState, "before-cloud-conflict")) return false;
    if (choice === "local" && !preserveRollback(remoteState, "before-local-conflict")) return false;

    cloudConflictDecision = choice === "cancel" ? "cancel" : "";
    runScheduled(async () => {
      try {
        await cloudSync.resolveConflict(choice);
      } catch (error) {
        onWarn("Cloud conflict resolution failed.", error);
        onStatus("error");
        onNotify("cloud-conflict-resolution-failed", "error");
      }
    });
    return true;
  };

  const onRemoteState = async (remoteState, metadata = {}) => {
    requireReplacer();
    const localState = store.getState();
    const localHasData = hasMeaningfulData(localState);
    const remoteHasData = hasMeaningfulData(remoteState);
    const sameData = areStatesEquivalent(localState, remoteState);

    if (cloudConflictDecision === "cancel" && metadata.source === "records") {
      onStatus("conflict");
      return "cancelled";
    }

    if (metadata.source === "conflict-resolution") {
      applyRemoteState(remoteState);
      return "applied-conflict-resolution";
    }

    if (!metadata.initial && metadata.source === "records") {
      applyRemoteState(remoteState);
      return "applied-record-update";
    }

    if (!localHasData && !remoteHasData && pendingUnboundLocalState) {
      if (confirmUnboundImport({ user: currentUser, state: cloneState(pendingUnboundLocalState) })) {
        requireReplacer()(cloneState(pendingUnboundLocalState));
        saveLocalState(store.getState(), localScope);
        pendingUnboundLocalState = null;
        requestCloudSave();
        refreshStateUi(store.getState());
        onNotify("unbound-local-state-imported");
        return "imported-unbound-local";
      }
      pendingUnboundLocalState = null;
    }

    if (!remoteHasData && localHasData) {
      cloudConflictDecision = "local";
      requestCloudSave();
      return "kept-local";
    }

    if (!remoteHasData || sameData) {
      applyRemoteState(remoteState);
      if (metadata.migrationRequired) requestCloudSave();
      return "applied-equivalent-or-empty";
    }

    if ((localHasData || metadata.hasPendingOutbox) && !cloudConflictDecision) {
      const decisionUserId = currentUser?.uid || "";
      cloudConflictDecision = "pending";
      const choice = await promptSyncChoice({
        type: "initial-state-conflict",
        message: buildConflictMessage(currentUser),
        user: currentUser,
        localState: cloneState(localState),
        remoteState: cloneState(remoteState),
        hasPendingOutbox: Boolean(metadata.hasPendingOutbox),
      });
      if ((currentUser?.uid || "") !== decisionUserId) return "stale-user";
      cloudConflictDecision = ["cloud", "local"].includes(choice) ? choice : "cancel";
      if (cloudConflictDecision === "cancel") {
        onStatus("conflict");
        onNotify("cloud-sync-paused-by-user");
        return "cancelled";
      }
    }

    if ((!localHasData && !metadata.hasPendingOutbox) || cloudConflictDecision === "cloud") {
      if (localHasData && !preserveRollback(localState, "before-cloud-overwrite")) {
        cloudConflictDecision = "cancel";
        onStatus("conflict");
        return "rollback-failed";
      }
      applyRemoteState(remoteState);
      if (metadata.migrationRequired) requestCloudSave();
      onNotify("cloud-state-applied");
      return "applied-cloud";
    }

    if (cloudConflictDecision === "local") {
      if (!preserveRollback(remoteState, "before-local-overwrite")) {
        cloudConflictDecision = "cancel";
        onStatus("conflict");
        return "rollback-failed";
      }
      requestCloudSave();
      return "kept-local";
    }

    return "no-op";
  };

  const performAuthAction = async () => {
    if (!cloudSync.enabled || authAction) return false;

    const wantsGoogleLogin = !currentUser || currentUser.isAnonymous;
    authAction = wantsGoogleLogin ? "signing-in" : "signing-out";
    emitAuthView();
    try {
      if (wantsGoogleLogin) {
        await cloudSync.signInWithGoogle();
        onNotify("google-sign-in-complete");
      } else {
        const result = await cloudSync.signOutToAnonymous();
        onNotify(result?.mode === "anonymous" ? "signed-out-to-anonymous" : "signed-out-to-local");
      }
      return true;
    } catch (error) {
      onWarn(wantsGoogleLogin ? "Sign-in action failed." : "Sign-out action failed.", error);
      onNotify(wantsGoogleLogin ? "google-sign-in-failed" : "sign-out-failed", "error");
      return false;
    } finally {
      authAction = null;
      emitAuthView();
    }
  };

  const attachCloudSync = (nextCloudSync) => {
    cloudSync = nextCloudSync || createFallbackCloudSync();
    emitAuthView();
    return cloudSync;
  };

  const bindWholeStateReplacer = (replacer) => {
    assertFunction(replacer, "replacer");
    replaceWholeState = replacer;
  };

  const ensureLocalScopeIfDisabled = () => {
    if (!cloudSync.enabled && !localScope) {
      switchLocalScope(null);
      return true;
    }
    return false;
  };

  return {
    attachCloudSync,
    bindWholeStateReplacer,
    persistCommittedLocalState,
    enqueueCloudState,
    onUserChange,
    onRemoteState,
    onConflict,
    performAuthAction,
    ensureLocalScopeIfDisabled,
    getCurrentUser: () => currentUser,
    getLocalScope: () => localScope,
    getPendingUnboundLocalState: () => pendingUnboundLocalState && cloneState(pendingUnboundLocalState),
    getConflictDecision: () => cloudConflictDecision,
    getAuthAction: () => authAction,
  };
}
