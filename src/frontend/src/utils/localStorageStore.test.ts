import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLocalStorageStore } from "./localStorageStore";

describe("createLocalStorageStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads null when the key is absent", () => {
    expect(createLocalStorageStore("missing").read()).toBeNull();
  });

  it("persists writes and removals", () => {
    const store = createLocalStorageStore("k");
    store.write("v");
    expect(localStorage.getItem("k")).toBe("v");
    expect(store.read()).toBe("v");

    store.remove();
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("notifies same-tab subscribers on write and remove, until unsubscribed", () => {
    const store = createLocalStorageStore("k");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.write("a");
    store.remove();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.write("b");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("relays cross-tab storage events for its own key or a full clear only", () => {
    const store = createLocalStorageStore("k");
    const listener = vi.fn();
    store.subscribe(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent("storage", { key: "k" }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("swallows storage failures but still notifies", () => {
    const store = createLocalStorageStore("k");
    const listener = vi.fn();
    store.subscribe(listener);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    expect(() => store.write("v")).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
  });
});
