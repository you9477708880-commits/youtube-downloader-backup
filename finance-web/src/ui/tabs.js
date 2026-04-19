import { $all, $ } from "./dom.js";

export function setActiveTab(tabId, doc = document) {
  $all(".sec", doc).forEach((section) => section.classList.remove("on"));
  $all(".nav button", doc).forEach((button) => button.classList.remove("on"));

  $(`t-${tabId}`, doc)?.classList.add("on");
  doc.querySelector(`.nav button[data-target="${tabId}"]`)?.classList.add("on");
}
