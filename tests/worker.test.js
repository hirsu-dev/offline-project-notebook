import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
test("offline worker caches only its app shell and leaves unrelated app caches intact", async () => {
  const source = await readFile(
      new URL("../web/worker.js", import.meta.url),
      "utf8",
    ),
    events = {},
    deleted = [],
    cached = [];
  const self = {
    registration: { scope: "https://example.test/offline-project-notebook/" },
    addEventListener(n, fn) {
      events[n] = fn;
    },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const context = {
    self,
    URL,
    fetch: () => Promise.reject(Error("offline")),
    caches: {
      async open() {
        return {
          async addAll(assets) {
            cached.push(...assets);
          },
        };
      },
      async keys() {
        return [
          "hirsu-fieldnotes-v0",
          "hirsu-fieldnotes-v1",
          "unrelated-app-cache",
        ];
      },
      async delete(k) {
        deleted.push(k);
      },
      async match(url) {
        return url.endsWith("index.html") ? { offline: true } : null;
      },
    },
  };
  runInNewContext(source, context);
  let wait;
  events.install({ waitUntil: (p) => (wait = p) });
  await wait;
  assert.ok(cached.includes("app.js"));
  events.activate({ waitUntil: (p) => (wait = p) });
  await wait;
  assert.deepEqual(deleted, ["hirsu-fieldnotes-v0"]);
  let response;
  events.fetch({
    request: {
      url: "https://example.test/offline-project-notebook/",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => (response = p),
  });
  assert.equal((await response).offline, true);
  let touched = false;
  events.fetch({
    request: {
      url: "https://example.test/other-app/",
      method: "GET",
      mode: "navigate",
    },
    respondWith() {
      touched = true;
    },
  });
  assert.equal(touched, false);
});
