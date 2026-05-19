export function formatMoney(value) {
  return `NT$ ${Math.round(Math.abs(value || 0)).toLocaleString()}`;
}

export function toMoneyInt(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return 0;

  const match = cleaned.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;

  const [, sign, wholeText, fractionText = ""] = match;
  let amount = Number(wholeText);
  if (!Number.isFinite(amount)) return 0;

  if (fractionText && Number(fractionText.charAt(0)) >= 5) {
    amount += 1;
  }

  return sign === "-" ? -amount : amount;
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] || char));
}

export function localDateStr(date = new Date()) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split("T")[0];
}
