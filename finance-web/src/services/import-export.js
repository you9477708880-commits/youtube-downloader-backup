import { cloneState } from "../state/initial-state.js";

export function isValidImportShape(data) {
  return Boolean(
    data &&
      Array.isArray(data.txs) &&
      Array.isArray(data.bsI) &&
      Array.isArray(data.accounts) &&
      Array.isArray(data.wishes) &&
      data.settings &&
      typeof data.settings === "object" &&
      !Array.isArray(data.settings) &&
      data.userCats &&
      typeof data.userCats === "object" &&
      !Array.isArray(data.userCats),
  );
}

export function exportData(state) {
  const dataStr = JSON.stringify(state);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "finance_backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("missing-file"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result || "{}");
        if (!isValidImportShape(imported)) {
          reject(new Error("invalid-schema"));
          return;
        }

        resolve(cloneState(imported));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsText(file);
  });
}
