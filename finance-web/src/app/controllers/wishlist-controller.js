import { toMoneyInt } from "../../utils/format.js";

function defaultCreateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWishlistController({
  elements,
  store,
  toast,
  setEditMode,
  commitState,
  renderWishlist,
  navigate,
  createId = defaultCreateId,
}) {
  const { root, name, price, category } = elements;
  let editingWishId = null;

  const reset = () => {
    editingWishId = null;
    name.value = "";
    price.value = "";
    setEditMode({ active: false });
  };

  const addWish = () => {
    const normalizedPrice = toMoneyInt(price.value);
    if (normalizedPrice <= 0) {
      toast.show("金額必須大於 0", "error");
      return;
    }

    const wasEditing = editingWishId !== null;
    commitState((draft) => {
      if (editingWishId !== null) {
        const wish = draft.wishes.find((item) => String(item.id) === String(editingWishId));
        if (!wish) return;
        wish.name = name.value.trim();
        wish.price = normalizedPrice;
        wish.cat = category.value;
      } else {
        draft.wishes.push({
          id: createId("wish"),
          name: name.value.trim(),
          price: normalizedPrice,
          cat: category.value,
        });
      }
    }, {
      updateUi: () => {
        reset();
        renderWishlist();
      },
    });
    toast.show(wasEditing ? "已儲存待購項目修改" : "已加入待購清單");
  };

  const beginEditWish = (id) => {
    const wish = store.getState().wishes.find((item) => String(item.id) === String(id));
    if (!wish) {
      toast.show("找不到要編輯的待購項目", "error");
      return;
    }

    editingWishId = id;
    navigate("wl");
    setEditMode({ active: true });
    name.value = wish.name || "";
    price.value = wish.price ?? "";
    category.value = wish.cat || "";
    root.getElementById("form-wish")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEditWish = () => {
    reset();
    toast.show("已取消編輯");
  };

  const delWish = (id) => {
    if (!store.getState().wishes.some((wish) => String(wish.id) === String(id))) return;
    const deletesCurrentEdit = editingWishId !== null && String(editingWishId) === String(id);
    commitState((draft) => {
      draft.wishes = draft.wishes.filter((wish) => String(wish.id) !== String(id));
    }, {
      updateUi: () => {
        if (deletesCurrentEdit) reset();
        renderWishlist();
      },
    });
  };

  const mvWish = (id, direction) => {
    if (!Number.isInteger(direction)) return;
    const currentWishes = store.getState().wishes;
    const currentIndex = currentWishes.findIndex((wish) => String(wish.id) === String(id));
    const requestedIndex = currentIndex + direction;
    if (currentIndex < 0 || requestedIndex < 0 || requestedIndex >= currentWishes.length) return;
    commitState((draft) => {
      const index = draft.wishes.findIndex((wish) => String(wish.id) === String(id));
      if (index < 0) return;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.wishes.length) return;
      const [wish] = draft.wishes.splice(index, 1);
      draft.wishes.splice(nextIndex, 0, wish);
    }, { updateUi: renderWishlist });
  };

  return {
    addWish,
    beginEditWish,
    cancelEditWish,
    delWish,
    mvWish,
    reset,
  };
}
