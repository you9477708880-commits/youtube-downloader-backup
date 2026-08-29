export function createDeviceDataController({
  elements,
  createService,
  getTarget,
  exportBackup,
  toast,
  reload = () => globalThis.location?.reload?.(),
} = {}) {
  if (!elements || typeof createService !== "function" || typeof getTarget !== "function") {
    throw new Error("device-data-controller-dependencies-required");
  }

  let plan = null;
  let step = 1;
  let busy = false;

  const hasUnsynced = () => Boolean(
    plan?.cloudStatus?.queueActive
    || plan?.cloudStatus?.hasPendingOutbox
    || plan?.cloudStatus?.conflict,
  );

  function setOpen(open) {
    elements.modal.classList.toggle("d-none", !open);
  }

  function render() {
    if (!plan) return;
    const signedIn = Boolean(plan.uid);
    const items = [
      plan.hasSnapshot ? "本機帳務快照" : "沒有本機帳務快照",
      plan.hasRollback ? "覆蓋前備援" : "沒有覆蓋前備援",
      `${plan.recoveryCount} 筆衝突復原紀錄`,
    ];
    if (signedIn) items.push(plan.hasOutbox ? "尚未送出的同步資料" : "沒有待送同步資料");

    elements.title.textContent = signedIn
      ? "清除此帳號在這台裝置的資料"
      : "清除此裝置的本機帳務資料";
    elements.summary.textContent = step === 1
      ? `將處理：${items.join("、")}。`
      : "最後確認：完成後會重新載入；如為雲端帳號，再次登入會從雲端重新下載。";
    elements.notice.textContent = signedIn
      ? "只清除此裝置，不會刪除 Firestore 雲端資料。Firebase 離線快取無法依帳號分開，因此同一網站其他帳號的離線快取也會清除，但雲端資料不受影響。"
      : "只清除目前本機資料區，不會初始化 Firebase，也不會刪除任何雲端資料。";
    elements.unsyncedWrap.hidden = !hasUnsynced() || step !== 1;
    elements.confirm.textContent = step === 1 ? "下一步" : "確認清除此裝置";
    elements.confirm.classList.toggle("danger", step === 2);
    elements.confirm.disabled = busy;
    elements.cancel.disabled = busy;
    elements.backup.disabled = busy;
  }

  async function open() {
    if (busy) return false;
    step = 1;
    elements.unsyncedAck.checked = false;
    try {
      plan = await createService().inspect(getTarget());
      render();
      setOpen(true);
      return true;
    } catch (error) {
      console.warn("Device data inspection failed.", error);
      toast?.show?.("無法確認這台裝置的資料範圍，已取消清除", "error");
      return false;
    }
  }

  function close() {
    if (busy) return false;
    setOpen(false);
    plan = null;
    step = 1;
    return true;
  }

  function backup() {
    if (busy) return false;
    exportBackup?.();
    toast?.show?.("已建立 JSON 備份；請確認下載完成後再繼續");
    return true;
  }

  async function confirm() {
    if (!plan || busy) return false;
    if (step === 1) {
      if (hasUnsynced() && !elements.unsyncedAck.checked) {
        toast?.show?.("有尚未同步的修改；請先備份並勾選確認，或取消清除", "error");
        return false;
      }
      step = 2;
      render();
      return true;
    }

    busy = true;
    render();
    const acknowledgeUnsynced = Boolean(elements.unsyncedAck.checked);
    let result;
    try {
      result = await createService().clear(getTarget(), { acknowledgeUnsynced });
    } catch (error) {
      result = { ok: false, code: "device-clear-unexpected-failure", error, requiresReload: false };
    }
    busy = false;

    if (result.ok) {
      toast?.show?.("這台裝置的指定資料已清除；雲端資料未刪除");
      reload();
      return true;
    }

    console.warn("Device data clear did not complete.", result.error || result.code);
    if (result.code === "firestore-persistence-clear-failed") {
      toast?.show?.("無法清除離線快取；請關閉同網站的其他分頁後重新載入再試。本機帳務仍保留。", "error");
    } else if (result.code === "unsynced-acknowledgement-required") {
      toast?.show?.("仍有尚未同步的修改，尚未清除任何資料", "error");
      step = 1;
    } else {
      toast?.show?.("只完成部分清理；主要帳務快照仍保留，請重新載入後再試", "error");
    }
    render();
    if (result.requiresReload) reload();
    return false;
  }

  return { open, close, backup, confirm };
}
