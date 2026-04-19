import { localDateStr } from "../utils/format.js";

export function resolvePresetRange(preset, now = new Date()) {
  let start = "";
  let end = localDateStr(now);

  if (preset === "month") {
    start = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    end = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (preset === "year") {
    start = `${now.getFullYear()}-01-01`;
    end = `${now.getFullYear()}-12-31`;
  } else if (preset === "week") {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(monday.getDate() - day + 1);
    start = localDateStr(monday);
  } else if (preset === "all") {
    start = "2000-01-01";
  }

  return { start, end };
}
