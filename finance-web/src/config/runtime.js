export const RUNTIME_MODES = Object.freeze({
  production: "production",
  acceptance: "acceptance",
});

export function getFinanceRuntime() {
  const raw = globalThis.__finance_runtime;
  const mode = raw?.mode === RUNTIME_MODES.acceptance
    ? RUNTIME_MODES.acceptance
    : RUNTIME_MODES.production;
  const isAcceptance = mode === RUNTIME_MODES.acceptance;

  return {
    mode,
    isAcceptance,
    cloudEnabled: !isAcceptance && raw?.cloudEnabled !== false,
    pwaEnabled: !isAcceptance && raw?.pwaEnabled !== false,
    storageNamespace: isAcceptance ? "acceptance" : "",
    label: isAcceptance ? "本機驗收版" : "正式版",
  };
}

export function runtimeStoragePrefix() {
  const namespace = getFinanceRuntime().storageNamespace;
  return namespace ? `fin_v7:${namespace}:` : "fin_v7:";
}

export function runtimeDatabaseName(baseName) {
  const namespace = getFinanceRuntime().storageNamespace;
  return namespace ? `${baseName}-${namespace}` : baseName;
}
