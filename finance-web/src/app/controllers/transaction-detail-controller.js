import { formatTransactionCategory } from "../../domain/transactions.js";
import { getTransactionTitle } from "../../views/transaction-detail-view.js";

const TYPE_LABELS = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  advance: "代墊",
  advance_repayment: "代墊收款",
};

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`transaction-detail-${name}-required`);
}

function displayText(value, fallback = "未填寫") {
  const text = String(value ?? "").replace(/\\n/g, "\n").trim();
  return text || fallback;
}

export function createTransactionDetailController({ elements, store, formatMoney, escapeHTML }) {
  if (!elements?.modal || !elements?.title || !elements?.body || !elements?.close) {
    throw new Error("transaction-detail-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("transaction-detail-store-required");
  requireFunction(formatMoney, "format-money");
  requireFunction(escapeHTML, "escape-html");

  let previousFocus = null;

  const field = (label, value, { multiline = false, tone = "" } = {}) => `
    <div class="transaction-detail-field">
      <dt>${escapeHTML(label)}</dt>
      <dd class="${multiline ? "transaction-detail-note" : ""} ${tone}">${escapeHTML(displayText(value))}</dd>
    </div>
  `;

  const money = (value) => formatMoney(Number(value) || 0);
  const findAccountName = (state, id) => state.accounts.find((account) => String(account.id) === String(id))?.name || "未知帳戶";

  const show = ({ title, html, trigger }) => {
    previousFocus = trigger?.focus ? trigger : null;
    elements.title.textContent = title;
    elements.body.innerHTML = `<dl class="transaction-detail-grid">${html}</dl>`;
    elements.modal.classList.remove("d-none");
    elements.close.focus?.();
    return true;
  };

  const close = () => {
    if (elements.modal.classList.contains("d-none")) return false;
    elements.modal.classList.add("d-none");
    const focusTarget = previousFocus;
    previousFocus = null;
    focusTarget?.focus?.();
    return true;
  };

  const trapFocus = (event) => {
    if (event?.key !== "Tab" || elements.modal.classList.contains("d-none")) return false;
    const focusable = [...(elements.modal.querySelectorAll?.(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || [])].filter((node) => node.getAttribute?.("aria-hidden") !== "true");
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = elements.modal.ownerDocument?.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault?.();
      last.focus?.();
      return true;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault?.();
      first.focus?.();
      return true;
    }
    return false;
  };

  const openTransaction = (id, trigger = null) => {
    const state = store.getState();
    const tx = state.txs.find((item) => String(item.id) === String(id));
    if (!tx) return false;

    const account = tx.type === "transfer"
      ? `${findAccountName(state, tx.fromAcc)} → ${findAccountName(state, tx.toAcc)}`
      : findAccountName(state, tx.acc);
    const fundName = tx.linkedFundId
      ? state.sinkingFunds.find((fund) => String(fund.id) === String(tx.linkedFundId))?.name || "已刪除的準備項目"
      : "";
    let html = "";
    html += field("交易類型", TYPE_LABELS[tx.type] || tx.type || "交易");
    html += field("金額", money(tx.amount), { tone: tx.type === "income" || tx.type === "advance_repayment" ? "text-inc" : tx.type === "transfer" ? "text-trn" : "text-exp" });
    html += field("日期", tx.date || "未填日期");
    html += field("分類", formatTransactionCategory(tx));
    html += field("帳戶", account);
    if (tx.type === "advance") {
      html += field("代墊對象", tx.person || "未指定");
      html += field("自己負擔", money(tx.ownAmount));
      html += field("應收金額", money(tx.receivableAmount));
    }
    if (fundName) html += field("對應準備", fundName);
    if (tx.externalSource) html += field("資料來源", tx.externalSource === "andromoney" ? "AndroMoney 匯入" : tx.externalSource);
    html += field("完整備註", tx.desc, { multiline: true });

    return show({ title: getTransactionTitle(tx), html, trigger });
  };

  const openBudgetSource = (id, type, trigger = null) => {
    const state = store.getState();
    if (type === "living-expense") return openTransaction(id, trigger);

    if (type === "fund-plan") {
      const fund = state.sinkingFunds.find((item) => `plan-${item.id}` === String(id));
      if (!fund) return false;
      const html = [
        field("準備項目", fund.name),
        field("分類", fund.category || "未分類"),
        field("每月提撥", money(fund.monthlyContribution)),
        field("開始月份", fund.startMonth || "未設定"),
        field("目標月份", fund.targetMonth || "未設定"),
        field("目標金額", money(fund.targetAmount)),
        field("完整備註", fund.note, { multiline: true }),
      ].join("");
      return show({ title: "大額準備提撥明細", html, trigger });
    }

    if (type === "fund-topup") {
      for (const fund of state.sinkingFunds) {
        const event = (fund.events || []).find((item) => String(item.id) === String(id) && item.type === "topup");
        if (!event) continue;
        const html = [
          field("準備項目", fund.name),
          field("補入金額", money(event.amount)),
          field("日期", event.date || "未填日期"),
          field("完整備註", event.note, { multiline: true }),
        ].join("");
        return show({ title: "大額準備補入明細", html, trigger });
      }
    }

    return false;
  };

  return {
    openTransaction,
    openBudgetSource,
    close,
    trapFocus,
    reset: close,
  };
}
