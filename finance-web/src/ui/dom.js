export function $(id, root = document) {
  if (typeof root.getElementById === "function") return root.getElementById(id);
  const safeId = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : String(id).replace(/["\\#.: [\]]/g, "\\$&");
  return root.querySelector(`#${safeId}`);
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
