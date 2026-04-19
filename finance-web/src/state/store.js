import { cloneState } from "./initial-state.js";

export function createStore(initialState, options = {}) {
  let state = cloneState(initialState);
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    getState() {
      return state;
    },
    replace(nextState) {
      state = cloneState(nextState);
      notify();
      options.onChange?.(state);
    },
    patch(partialState) {
      state = { ...state, ...partialState };
      notify();
      options.onChange?.(state);
    },
    update(updater) {
      const draft = cloneState(state);
      const result = updater(draft);
      state = result ?? draft;
      notify();
      options.onChange?.(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
