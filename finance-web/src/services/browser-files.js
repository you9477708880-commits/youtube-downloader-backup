export function backupFilename(label, now = () => new Date()) {
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  return `finance-backup-${String(label || "manual")}-${stamp}.json`;
}

export function readFileAsText(file, FileReaderClass = globalThis.FileReader) {
  if (typeof file?.text === "function") {
    return file.text().then((value) => String(value || ""));
  }
  if (typeof FileReaderClass !== "function") return Promise.reject(new Error("file-reader-unavailable"));
  return new Promise((resolve, reject) => {
    const reader = new FileReaderClass();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsText(file, "utf-8");
  });
}

export function downloadTextFile({ content, filename, type }, {
  doc = globalThis.document,
  URLClass = globalThis.URL,
  BlobClass = globalThis.Blob,
} = {}) {
  if (!doc || !URLClass?.createObjectURL || typeof BlobClass !== "function") {
    throw new Error("file-download-unavailable");
  }
  const blob = new BlobClass([content], { type });
  const url = URLClass.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URLClass.revokeObjectURL(url);
  }
}
