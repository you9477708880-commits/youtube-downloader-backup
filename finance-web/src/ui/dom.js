export function $(id, root = document) {
  return root.getElementById(id);
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
