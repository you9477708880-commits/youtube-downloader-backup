import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../src/state/store.js";
import { createWishlistController } from "../src/app/controllers/wishlist-controller.js";

function createHarness() {
  const store = createStore({
    wishes: [
      { id: "wish-alpha", name: "A", price: 100, cat: "其他" },
      { id: 901, name: "B", price: 200, cat: "3C / 家電" },
      { id: "wish-omega", name: "C", price: 300, cat: "娛樂" },
    ],
    txs: [{ id: "tx-1", type: "expense", amount: 50 }],
    sinkingFunds: [{ id: "fund-1", events: [] }],
    userCats: { income: [], expense: ["自訂使用中"] },
    settings: {
      catBudgets: {
        "固定分類": 1000,
        "自訂使用中": 2000,
        "未使用 A": 3000,
        "未使用 B": 4000,
      },
    },
  });
  const calls = {
    commit: 0,
    save: 0,
    render: 0,
    navigate: [],
    editModes: [],
    toasts: [],
    scroll: 0,
    confirm: true,
  };
  const dom = {
    wishName: { value: "" },
    wishPrice: { value: "" },
    wishCategory: { value: "其他" },
    root: {
      getElementById: (id) => id === "form-wish"
        ? { scrollIntoView: () => { calls.scroll += 1; } }
        : null,
    },
  };
  const controller = createWishlistController({
    elements: {
      root: dom.root,
      name: dom.wishName,
      price: dom.wishPrice,
      category: dom.wishCategory,
    },
    store,
    toast: { show: (...args) => calls.toasts.push(args) },
    setEditMode: (value) => calls.editModes.push(value),
    renderWishlist: () => { calls.render += 1; },
    commitState: (mutator, { updateUi }) => {
      calls.commit += 1;
      calls.save += 1;
      store.update(mutator);
      updateUi(store.getState());
    },
    navigate: (tabId) => calls.navigate.push(tabId),
    constants: { expenseCategories: ["固定分類"] },
    confirmCleanup: () => calls.confirm,
  });
  return { store, calls, dom, controller };
}

test("adds and edits wishes while saving and rendering once", () => {
  const { store, calls, dom, controller } = createHarness();

  dom.wishName.value = "新手機";
  dom.wishPrice.value = "12000";
  dom.wishCategory.value = "3C / 家電";
  controller.addWish();

  const added = store.getState().wishes.at(-1);
  assert.match(added.id, /^wish-/);
  assert.deepEqual(
    { name: added.name, price: added.price, cat: added.cat },
    { name: "新手機", price: 12000, cat: "3C / 家電" },
  );
  assert.equal(calls.save, 1);
  assert.equal(calls.commit, 1);
  assert.equal(calls.render, 1);

  controller.beginEditWish("901");
  dom.wishName.value = "更新後 B";
  dom.wishPrice.value = "250";
  dom.wishCategory.value = "娛樂";
  controller.addWish();

  assert.deepEqual(store.getState().wishes.map((wish) => wish.id), ["wish-alpha", 901, "wish-omega", added.id]);
  assert.deepEqual(store.getState().wishes[1], { id: 901, name: "更新後 B", price: 250, cat: "娛樂" });
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
});

test("validation failure and missing edit target leave state unchanged", () => {
  const { store, calls, dom, controller } = createHarness();
  const original = structuredClone(store.getState());

  dom.wishPrice.value = "0";
  controller.addWish();
  controller.beginEditWish("missing");

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.commit, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toasts[0][1], "error");
  assert.equal(calls.toasts[1][1], "error");
});

test("begin edit accepts a rendered string ID and fills the form", () => {
  const { calls, dom, controller } = createHarness();

  controller.beginEditWish("901");

  assert.deepEqual(calls.navigate, ["wl"]);
  assert.equal(dom.wishName.value, "B");
  assert.equal(dom.wishPrice.value, 200);
  assert.equal(dom.wishCategory.value, "3C / 家電");
  assert.equal(calls.scroll, 1);
  assert.deepEqual(calls.editModes.at(-1), { active: true });
});

test("valid moves preserve records and unrelated collections", () => {
  const { store, calls, controller } = createHarness();
  const originalTxs = structuredClone(store.getState().txs);
  const originalFunds = structuredClone(store.getState().sinkingFunds);

  controller.mvWish("wish-omega", -1);
  controller.mvWish("901", -1);

  assert.deepEqual(store.getState().wishes.map((wish) => wish.id), ["wish-alpha", 901, "wish-omega"]);
  assert.deepEqual(store.getState().txs, originalTxs);
  assert.deepEqual(store.getState().sinkingFunds, originalFunds);
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
});

test("missing deletes and out-of-range moves have no side effects", () => {
  const { store, calls, controller } = createHarness();
  const original = structuredClone(store.getState());

  controller.delWish("missing");
  controller.mvWish("wish-alpha", -1);
  controller.mvWish("wish-omega", 1);

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
});

test("cancel and reset-like form flow clear edit mode without saving", () => {
  const { calls, dom, controller } = createHarness();

  controller.beginEditWish("wish-alpha");
  controller.cancelEditWish();

  assert.equal(dom.wishName.value, "");
  assert.equal(dom.wishPrice.value, "");
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
  assert.deepEqual(calls.editModes.at(-1), { active: false });
});

test("deleting the item being edited clears stale edit state", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditWish("wish-alpha");
  controller.delWish("wish-alpha");
  dom.wishName.value = "刪除後新增";
  dom.wishPrice.value = "450";
  dom.wishCategory.value = "其他";
  controller.addWish();

  assert.equal(store.getState().wishes.some((wish) => wish.name === "刪除後新增"), true);
  assert.equal(calls.save, 2);
  assert.equal(calls.render, 2);
  assert.equal(calls.toasts.at(-1)[0], "已加入待購清單");
});

test("reset clears editing identity without saving or rendering", () => {
  const { store, calls, dom, controller } = createHarness();

  controller.beginEditWish("wish-alpha");
  controller.reset();
  dom.wishName.value = "切換資料後新增";
  dom.wishPrice.value = "500";
  controller.addWish();

  assert.equal(store.getState().wishes[0].name, "A");
  assert.equal(store.getState().wishes.at(-1).name, "切換資料後新增");
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
});

test("category budget cleanup removes only unused entries after confirmation", () => {
  const { store, calls, controller } = createHarness();

  controller.cleanupCatBudgets();

  assert.deepEqual(store.getState().settings.catBudgets, {
    "固定分類": 1000,
    "自訂使用中": 2000,
  });
  assert.equal(calls.save, 1);
  assert.equal(calls.render, 1);
  assert.match(calls.toasts.at(-1)[0], /已清理 2 個/);
});

test("cancelled category budget cleanup has no side effects", () => {
  const { store, calls, controller } = createHarness();
  const original = structuredClone(store.getState());
  calls.confirm = false;

  controller.cleanupCatBudgets();

  assert.deepEqual(store.getState(), original);
  assert.equal(calls.save, 0);
  assert.equal(calls.render, 0);
});
