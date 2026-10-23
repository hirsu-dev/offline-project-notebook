import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";
import { readFile } from "node:fs/promises";
test("actual editor saves text, tasks and keyboard-movable diagram components", async () => {
  const window = new Window({ url: "https://example.test" });
  window.document.write(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  );
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    indexedDB: new IDBFactory(),
    confirm: () => true,
  };
  const old = new Map(
    Object.keys(globals).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  for (const [k, v] of Object.entries(globals))
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  const wait = () => new Promise((r) => setTimeout(r, 25));
  try {
    await import("../web/app.js");
    await wait();
    window.document.querySelector("#new-note").click();
    await wait();
    const title = window.document.querySelector('[name="title"]');
    title.value = "Telescope inspection";
    title.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.document.querySelector('[data-section="tasks"]').click();
    await wait();
    window.document.querySelector("#task-text").value = "Check the cable";
    window.document.querySelector("#add-task").click();
    await wait();
    window.document.querySelector('[data-section="diagram"]').click();
    await wait();
    window.document.querySelector("#node-label").value = "Motor";
    window.document.querySelector("#add-node").click();
    await wait();
    let node = window.document.querySelector("[data-node]");
    node.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    window.document.querySelector("#save").click();
    await wait();
    assert.match(
      window.document.querySelector("#save-state").textContent,
      /SAVED LOCALLY/,
    );
    assert.match(
      window.document.querySelector("#note-list").textContent,
      /Telescope inspection/,
    );
    assert.match(
      window.document.querySelector("#tasks").textContent,
      /Check the cable/,
    );
    window.dispatchEvent(new window.Event("pagehide"));
  } finally {
    for (const [k, d] of old) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    await window.happyDOM.abort();
  }
});
