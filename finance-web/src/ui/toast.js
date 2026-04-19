export function createToastManager(doc = document) {
  return {
    show(message, type = "success") {
      const container = doc.getElementById("toast-container");
      if (!container) return;

      const node = doc.createElement("div");
      node.className = `toast ${type}`;
      node.textContent = `${type === "success" ? "✅" : "⚠️"} ${message}`;
      container.appendChild(node);

      window.setTimeout(() => {
        node.style.animation = "toastFadeOut 0.3s forwards";
        window.setTimeout(() => node.remove(), 300);
      }, 3000);
    },
  };
}
