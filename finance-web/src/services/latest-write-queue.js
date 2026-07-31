export function createLatestWriteQueue({ write, onStart, onIdle }) {
  if (typeof write !== "function") {
    throw new TypeError("write is required");
  }

  let requestedVersion = 0;
  let completedVersion = 0;
  let activePromise = null;
  let pendingLatest;
  let destroyed = false;

  const drain = async () => {
    let failure = null;
    onStart?.();

    try {
      while (!destroyed && completedVersion < requestedVersion) {
        const versionToWrite = requestedVersion;
        const value = pendingLatest;
        await write(value);
        completedVersion = versionToWrite;
      }
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      activePromise = null;
      onIdle?.(failure);
    }
  };

  return {
    enqueue(value) {
      if (destroyed) return Promise.resolve();
      pendingLatest = value;
      requestedVersion += 1;
      if (!activePromise) activePromise = Promise.resolve().then(drain);
      return activePromise;
    },
    destroy() {
      destroyed = true;
    },
    isActive() {
      return activePromise !== null;
    },
  };
}
