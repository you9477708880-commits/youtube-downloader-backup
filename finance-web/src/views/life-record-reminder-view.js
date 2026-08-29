const STATUS_LABELS = {
  not_due: "尚未到期",
  due_soon: "接近提醒",
  overdue: "可能已超過",
  no_matches: "尚無符合紀錄",
  disabled: "已停用",
};

function actionButton(doc, label, action, id, className = "sbtn outline compact") {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.id = String(id);
  button.textContent = label;
  return button;
}

function describeTiming(reminder) {
  if (reminder.status === "disabled" || reminder.status === "no_matches") return STATUS_LABELS[reminder.status];
  if (reminder.status === "overdue") return `已超過預計日期 ${Math.abs(reminder.daysUntilNext)} 天`;
  if (reminder.daysUntilNext === 0) return "預計日期是今天";
  return `距預計日期 ${reminder.daysUntilNext} 天`;
}

export function renderLifeRoutineCenter({ model, elements }) {
  const doc = elements.list.ownerDocument;
  if (elements.heading) {
    const alerts = [];
    if (model.overdue) alerts.push(`${model.overdue} 項已逾期`);
    if (model.dueSoon) alerts.push(`${model.dueSoon} 項即將到期`);
    elements.heading.textContent = alerts.length
      ? `生活週期提醒｜${alerts.join("、")}`
      : `生活週期提醒｜${model.total ? `${model.total} 項，沒有近期提醒` : "尚未建立"}`;
  }
  elements.list.replaceChildren();
  if (!model.items.length) {
    const empty = doc.createElement("p");
    empty.className = "life-routine-empty";
    empty.textContent = "尚未建立提醒。先搜尋「洗牙」或「機油」，再把這個週期儲存起來。";
    elements.list.append(empty);
    return;
  }

  model.items.forEach(({ routine, reminder }) => {
    const card = doc.createElement("article");
    card.className = "life-routine-card";
    card.dataset.state = reminder.status;

    const content = doc.createElement("div");
    content.className = "life-routine-card-content";
    const title = doc.createElement("strong");
    title.textContent = routine.name || routine.query;
    const status = doc.createElement("span");
    status.className = "life-routine-card-status";
    status.textContent = describeTiming(reminder);
    const detail = doc.createElement("small");
    detail.textContent = reminder.status === "no_matches" || reminder.status === "disabled"
      ? `關鍵字：${routine.query}｜每 ${routine.expectedIntervalDays} 天`
      : `最近：${reminder.latestDate}｜預計：${reminder.nextExpectedDate}｜每 ${routine.expectedIntervalDays} 天`;
    content.append(title, status, detail);

    const actions = doc.createElement("div");
    actions.className = "life-routine-card-actions";
    actions.append(
      actionButton(doc, "查看紀錄", "view-life-routine", routine.id),
      actionButton(doc, "編輯", "edit-life-routine", routine.id),
      actionButton(doc, routine.enabled === false ? "啟用" : "停用", "toggle-life-routine", routine.id),
      actionButton(doc, "刪除", "delete-life-routine", routine.id),
    );
    card.append(content, actions);
    elements.list.append(card);
  });
}
