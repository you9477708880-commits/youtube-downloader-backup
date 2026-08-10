import { toMoneyInt } from "../../utils/format.js";

function defaultCreateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createBalanceSheetController({
  elements,
  store,
  toast,
  setEditMode,
  commitState,
  renderAll,
  navigate,
  confirmDelete = (message) => globalThis.window.confirm(message),
  createId = defaultCreateId,
}) {
  const {
    root,
    name,
    type,
    categoryWrap,
    category,
    amount,
    emergency,
  } = elements;
  let editingBsId = "";
  let editingBsIsAccount = false;

  const reset = () => {
    editingBsId = "";
    editingBsIsAccount = false;
    name.value = "";
    type.value = "account";
    categoryWrap.classList.add("d-none");
    category.value = "asset";
    amount.value = "";
    emergency.checked = false;
    setEditMode({ active: false });
  };

  const addBs = () => {
    const normalizedAmount = toMoneyInt(amount.value);
    if (normalizedAmount < 0) {
      toast.show("金額不能小於 0", "error");
      return;
    }

    const wasEditing = !!editingBsId;
    commitState((draft) => {
      if (editingBsId) {
        if (editingBsIsAccount) {
          const account = draft.accounts.find((item) => String(item.id) === String(editingBsId));
          if (!account) return;
          account.name = name.value.trim();
          account.initialBalance = normalizedAmount;
          account.isEm = emergency.checked;
        } else {
          const item = draft.bsI.find((entry) => String(entry.id) === String(editingBsId));
          if (!item) return;
          item.name = name.value.trim();
          item.amount = normalizedAmount;
          item.cat = category.value;
          item.isEm = emergency.checked;
        }
      } else if (type.value === "account") {
        draft.accounts.push({
          id: createId("a"),
          name: name.value.trim(),
          type: "asset",
          isEm: emergency.checked,
          initialBalance: normalizedAmount,
        });
      } else {
        draft.bsI.push({
          id: createId("bs"),
          name: name.value.trim(),
          amount: normalizedAmount,
          cat: category.value,
          isEm: emergency.checked,
        });
      }
    }, {
      updateUi: () => {
        reset();
        renderAll();
      },
    });
    toast.show(wasEditing ? "已儲存資產負債修改" : "已新增資產 / 負債項目");
  };

  const beginEditBs = (id, isAccount) => {
    const state = store.getState();
    const item = isAccount
      ? state.accounts.find((entry) => String(entry.id) === String(id))
      : state.bsI.find((entry) => String(entry.id) === String(id));
    if (!item) {
      toast.show("找不到要編輯的項目", "error");
      return;
    }

    editingBsId = String(id);
    editingBsIsAccount = isAccount;
    navigate("bs");
    setEditMode({ active: true, isAccount });
    type.value = isAccount ? "account" : "item";
    categoryWrap.classList.toggle("d-none", isAccount);
    name.value = item.name || "";
    amount.value = isAccount ? item.initialBalance ?? "" : item.amount ?? "";
    emergency.checked = !!item.isEm;
    if (!isAccount) category.value = item.cat || "asset";
    root.getElementById("form-bs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEditBs = () => {
    reset();
    toast.show("已取消編輯");
  };

  const delBs = (id, isAccount) => {
    if (!confirmDelete("確定要刪除這個項目嗎？")) return;
    const deletesCurrentEdit =
      editingBsId &&
      editingBsIsAccount === Boolean(isAccount) &&
      String(editingBsId) === String(id);
    commitState((draft) => {
      if (isAccount) draft.accounts = draft.accounts.filter((account) => String(account.id) !== String(id));
      else draft.bsI = draft.bsI.filter((item) => String(item.id) !== String(id));
    }, {
      updateUi: () => {
        if (deletesCurrentEdit) reset();
        renderAll();
      },
    });
  };

  const toggleEm = (id, isAccount) => {
    commitState((draft) => {
      const list = isAccount ? draft.accounts : draft.bsI;
      const item = list.find((entry) => String(entry.id) === String(id));
      if (item) item.isEm = !item.isEm;
    }, { updateUi: renderAll });
  };

  return {
    addBs,
    beginEditBs,
    cancelEditBs,
    delBs,
    toggleEm,
    reset,
  };
}
