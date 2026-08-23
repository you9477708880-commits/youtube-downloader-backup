import { formatTransactionCategory, getAdvanceRepaidAmount } from "../../domain/transactions.js";
import { getTransactionTitle } from "../../views/transaction-detail-view.js";

const TYPE_LABELS = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  advance: "代墊",
  advance_repayment: "代墊收款",
  balance_adjustment: "帳戶調整",
};

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`transaction-detail-${name}-required`);
}

function displayText(value, fallback = "未填寫") {
  const text = String(value ?? "").replace(/\\n/g, "\n").trim();
  return text || fallback;
}

export function createTransactionDetailController({ elements, store, formatMoney, escapeHTML, updateTransaction }) {
  if (!elements?.modal || !elements?.title || !elements?.body || !elements?.edit || !elements?.close) {
    throw new Error("transaction-detail-elements-required");
  }
  if (!store || typeof store.getState !== "function") throw new Error("transaction-detail-store-required");
  requireFunction(formatMoney, "format-money");
  requireFunction(escapeHTML, "escape-html");
  requireFunction(updateTransaction, "update-transaction");

  let previousFocus = null;
  let activeTransactionId = null;
  let editing = false;

  const field = (label, value, { multiline = false, tone = "" } = {}) => `
    <div class="transaction-detail-field">
      <dt>${escapeHTML(label)}</dt>
      <dd class="${multiline ? "transaction-detail-note" : ""} ${tone}">${escapeHTML(displayText(value))}</dd>
    </div>
  `;

  const money = (value) => formatMoney(Number(value) || 0);
  const findAccountName = (state, id) => state.accounts.find((account) => String(account.id) === String(id))?.name || "未知帳戶";

  const show = ({ title, html, trigger, editable = false }) => {
    previousFocus = trigger?.focus ? trigger : null;
    editing = false;
    elements.title.textContent = title;
    elements.body.innerHTML = `<dl class="transaction-detail-grid">${html}</dl>`;
    elements.edit.classList.toggle("d-none", !editable);
    elements.modal.classList.remove("d-none");
    elements.close.focus?.();
    return true;
  };

  const close = () => {
    if (elements.modal.classList.contains("d-none")) return false;
    elements.modal.classList.add("d-none");
    elements.edit.classList.add("d-none");
    activeTransactionId = null;
    editing = false;
    const focusTarget = previousFocus;
    previousFocus = null;
    focusTarget?.focus?.();
    return true;
  };

  const option = (value, label, selectedValue) => `<option value="${escapeHTML(value)}"${String(value) === String(selectedValue) ? " selected" : ""}>${escapeHTML(label)}</option>`;
  const inputValue = (value) => escapeHTML(String(value ?? ""));

  const renderEditor = (tx) => {
    const state = store.getState();
    const accountOptionsFor = (selectedValue) => {
      const deletedOption = selectedValue && !state.accounts.some((item) => String(item.id) === String(selectedValue))
        ? option(selectedValue, "已刪除帳戶（原紀錄）", selectedValue)
        : "";
      return deletedOption + state.accounts.map((item) => option(item.id, item.name, selectedValue)).join("");
    };
    const accountOptions = accountOptionsFor(tx.acc);
    const fromAccountOptions = accountOptionsFor(tx.fromAcc || tx.acc);
    const defaultToAccount = tx.toAcc || state.accounts.find((item) => String(item.id) !== String(tx.fromAcc || tx.acc))?.id || "";
    const toAccountOptions = accountOptionsFor(defaultToAccount);
    const typeOptions = tx.type === "advance_repayment"
      ? option("advance_repayment", "代墊收款", "advance_repayment")
      : [
          option("income", "收入", tx.type),
          option("expense", "支出", tx.type),
          option("transfer", "轉帳", tx.type),
          option("advance", "代墊", tx.type),
        ].join("");
    const category = tx.category || tx.cat || "未分類";
    const linkedFundName = tx.linkedFundId
      ? state.sinkingFunds.find((item) => String(item.id) === String(tx.linkedFundId))?.name || "已刪除的準備項目"
      : "";
    const advanceRepaidAmount = tx.type === "advance" ? getAdvanceRepaidAmount(state.txs, tx.id) : 0;

    elements.title.textContent = "編輯交易";
    elements.edit.classList.add("d-none");
    elements.body.innerHTML = `
      <form id="transaction-detail-form" class="transaction-detail-editor">
        <label class="transaction-detail-control">
          <span>交易類型</span>
          <select id="transaction-detail-type"${tx.type === "advance_repayment" ? " disabled" : ""}>${typeOptions}</select>
        </label>
        <div class="transaction-detail-editor-grid">
          <label class="transaction-detail-control">
            <span>金額</span>
            <input id="transaction-detail-amount" type="number" min="1" step="1" required value="${inputValue(tx.amount)}">
          </label>
          <label class="transaction-detail-control">
            <span>日期</span>
            <input id="transaction-detail-date" type="date" required value="${inputValue(tx.date)}">
          </label>
        </div>
        <div class="transaction-detail-editor-grid" data-detail-types="income,expense,advance">
          <label class="transaction-detail-control">
            <span>主分類</span>
            <input id="transaction-detail-category" maxlength="80" required value="${inputValue(category)}">
          </label>
          <label class="transaction-detail-control">
            <span>子分類</span>
            <input id="transaction-detail-subcategory" maxlength="80" value="${inputValue(tx.subcategory || "未分類")}">
          </label>
        </div>
        <label class="transaction-detail-control" data-detail-types="income,expense,advance,advance_repayment">
          <span>使用帳戶</span>
          <select id="transaction-detail-account" required>${accountOptions}</select>
        </label>
        <div class="transaction-detail-editor-grid" data-detail-types="transfer">
          <label class="transaction-detail-control">
            <span>轉出帳戶</span>
            <select id="transaction-detail-from-account">${fromAccountOptions}</select>
          </label>
          <label class="transaction-detail-control">
            <span>轉入帳戶</span>
            <select id="transaction-detail-to-account">${toAccountOptions}</select>
          </label>
        </div>
        <div class="transaction-detail-editor-grid" data-detail-types="advance">
          <label class="transaction-detail-control">
            <span>代墊對象</span>
            <input id="transaction-detail-person" maxlength="80" value="${inputValue(tx.person)}">
          </label>
          <label class="transaction-detail-control">
            <span>自己負擔</span>
            <input id="transaction-detail-own-amount" type="number" min="0" step="1" value="${inputValue(tx.ownAmount)}">
          </label>
        </div>
        <label class="transaction-detail-control">
          <span>完整備註</span>
          <textarea id="transaction-detail-description" rows="5" maxlength="4000">${inputValue(displayText(tx.desc, ""))}</textarea>
        </label>
        ${linkedFundName ? `<p class="transaction-detail-warning" id="transaction-detail-fund-warning">目前對應準備：${escapeHTML(linkedFundName)}。修改金額、日期或改成其他類型時，會解除這筆準備連結。</p>` : ""}
        ${advanceRepaidAmount > 0 ? `<p class="transaction-detail-warning">目前已收回 ${escapeHTML(money(advanceRepaidAmount))}；修改後的應收金額不能低於已收回金額，且不能改成其他交易類型。</p>` : ""}
        <p class="transaction-detail-warning d-none" id="transaction-detail-type-warning"></p>
        <div class="transaction-detail-edit-actions">
          <button type="button" class="sbtn" data-action="save-transaction-detail">儲存變更</button>
          <button type="button" class="sbtn outline" data-action="cancel-transaction-detail-edit">取消</button>
        </div>
      </form>
    `;
    editing = true;
    syncEditorType();
    elements.body.querySelector?.("#transaction-detail-description")?.focus?.();
    return true;
  };

  const syncEditorType = () => {
    if (!editing) return false;
    const type = elements.body.querySelector?.("#transaction-detail-type")?.value;
    elements.body.querySelectorAll?.("[data-detail-types]")?.forEach((node) => {
      const visible = String(node.dataset.detailTypes || "").split(",").includes(type);
      node.classList.toggle("d-none", !visible);
    });
    const warning = elements.body.querySelector?.("#transaction-detail-type-warning");
    if (warning) {
      const original = store.getState().txs.find((item) => String(item.id) === String(activeTransactionId));
      const typeChanged = original && original.type !== type;
      warning.textContent = typeChanged ? "改變交易類型會立即重新計算收入、支出與帳戶餘額。" : "";
      warning.classList.toggle("d-none", !typeChanged);
    }
    return true;
  };

  const startEdit = () => {
    const tx = store.getState().txs.find((item) => String(item.id) === String(activeTransactionId));
    return tx ? renderEditor(tx) : false;
  };

  const cancelEdit = () => {
    if (!editing || !activeTransactionId) return false;
    const id = activeTransactionId;
    openTransaction(id, previousFocus);
    elements.edit.focus?.();
    return true;
  };

  const saveEdit = async () => {
    if (!editing || !activeTransactionId) return false;
    const form = elements.body.querySelector?.("#transaction-detail-form");
    if (form?.checkValidity && !form.checkValidity()) {
      form.reportValidity?.();
      return false;
    }
    const read = (selector) => elements.body.querySelector?.(selector)?.value ?? "";
    const saved = await updateTransaction(activeTransactionId, {
      type: read("#transaction-detail-type"),
      amount: read("#transaction-detail-amount"),
      date: read("#transaction-detail-date"),
      category: read("#transaction-detail-category"),
      subcategory: read("#transaction-detail-subcategory"),
      accountId: read("#transaction-detail-account"),
      fromAcc: read("#transaction-detail-from-account"),
      toAcc: read("#transaction-detail-to-account"),
      person: read("#transaction-detail-person"),
      ownAmount: read("#transaction-detail-own-amount"),
      desc: read("#transaction-detail-description"),
    });
    if (!saved) return false;
    const id = activeTransactionId;
    openTransaction(id, previousFocus);
    elements.edit.focus?.();
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
    activeTransactionId = tx.id;

    const account = tx.type === "transfer"
      ? `${findAccountName(state, tx.fromAcc)} → ${findAccountName(state, tx.toAcc)}`
      : findAccountName(state, tx.acc);
    const fundName = tx.linkedFundId
      ? state.sinkingFunds.find((fund) => String(fund.id) === String(tx.linkedFundId))?.name || "已刪除的準備項目"
      : "";
    let html = "";
    html += field("交易類型", TYPE_LABELS[tx.type] || tx.type || "交易");
    html += field("金額", money(tx.amount), { tone: tx.type === "income" || tx.type === "advance_repayment" || (tx.type === "balance_adjustment" && tx.direction === "increase") ? "text-inc" : tx.type === "transfer" ? "text-trn" : "text-exp" });
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

    return show({ title: getTransactionTitle(tx), html, trigger, editable: tx.type !== "balance_adjustment" });
  };

  const openBudgetSource = (id, type, trigger = null) => {
    const state = store.getState();
    if (type === "living-expense") return openTransaction(id, trigger);
    activeTransactionId = null;

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
    startEdit,
    cancelEdit,
    saveEdit,
    syncEditorType,
    close,
    trapFocus,
    reset: close,
  };
}
