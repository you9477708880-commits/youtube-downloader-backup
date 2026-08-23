import { calculateAccountBalances } from "../../domain/accounts.js";
import { buildBalanceAdjustment } from "../../domain/transactions.js";
import { toMoneyInt } from "../../utils/format.js";

export function createAccountCenterController({
  root,
  store,
  toast,
  commitState,
  renderAll,
  localDateStr,
  confirmAdjustment = (message) => globalThis.window.confirm(message),
} = {}) {
  if (!root || !store || typeof commitState !== "function") throw new Error("account-center-boundary-required");

  const findInput = (id) => [...root.querySelectorAll("[data-reconcile-input]")]
    .find((node) => String(node.dataset.reconcileInput) === String(id));

  const reconcile = (id) => {
    const state = store.getState();
    const account = state.accounts.find((item) => String(item.id) === String(id));
    const input = findInput(id);
    if (!account || !input) {
      toast.show("找不到要對帳的帳戶", "error");
      return false;
    }
    if (String(input.value).trim() === "") {
      toast.show("請先輸入金融機構顯示的實際餘額", "error");
      return false;
    }
    const actualBalance = toMoneyInt(input.value);
    const calculatedBalance = calculateAccountBalances(state)[account.id] || 0;
    const difference = actualBalance - calculatedBalance;
    if (!difference) {
      toast.show("帳戶餘額一致，不需要建立調整");
      return true;
    }
    const direction = difference > 0 ? "增加" : "減少";
    if (!confirmAdjustment(`目前計算餘額與實際餘額相差 ${Math.abs(difference)} 元。要建立一筆「帳戶調整」使餘額${direction}嗎？這不會計入收入、支出或預算。`)) return false;

    commitState((draft) => {
      draft.txs.push(buildBalanceAdjustment({
        accountId: account.id,
        difference,
        date: localDateStr(),
        accountName: account.name,
      }));
    }, { updateUi: renderAll });
    toast.show("已建立可追溯的對帳調整，不計入收入或支出");
    return true;
  };

  return { reconcile, reset: () => {} };
}
