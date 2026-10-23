import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { newNote, cleanNote, moveNode } from "../web/model.js";
import { openNotebook, encodeBackup, decodeBackup } from "../web/store.js";
test("concurrent edits reject a stale revision instead of replacing another tab", async () => {
  const f = new IDBFactory(),
    a = await openNotebook(f),
    b = await openNotebook(f),
    n = await a.save(newNote(), 0);
  await a.save({ ...n, body: "First edit" }, n.revision);
  await assert.rejects(
    b.save({ ...n, body: "Stale edit" }, n.revision),
    /newer version/,
  );
  assert.equal((await b.notes())[0].body, "First edit");
  a.close();
  b.close();
});
test("backup restores photo bytes and changes revisions so older tabs conflict", async () => {
  const store = await openNotebook(new IDBFactory()),
    n = await store.save(newNote(), 0);
  await store.addPhoto({
    id: "photo-1",
    noteId: n.id,
    type: "image/png",
    caption: "A sample attachment",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  });
  const snapshot = await store.snapshot(),
    backup = await encodeBackup(snapshot.notes, snapshot.photos),
    decoded = decodeBackup(JSON.parse(JSON.stringify(backup)));
  await store.restore(decoded.notes, decoded.photos);
  assert.deepEqual(
    [...new Uint8Array(await (await store.photos())[0].blob.arrayBuffer())],
    [1, 2, 3],
  );
  await assert.rejects(
    store.save({ ...n, body: "Old tab" }, n.revision),
    /newer version/,
  );
  store.close();
});
test("invalid import and orphan photo cannot change existing records", async () => {
  const store = await openNotebook(new IDBFactory()),
    n = await store.save(newNote(), 0);
  await assert.rejects(store.restore([{ ...n, title: "" }], []));
  assert.equal((await store.notes()).length, 1);
  await assert.rejects(
    store.addPhoto({
      id: "photo",
      noteId: "missing",
      type: "image/png",
      caption: "",
      blob: new Blob(["x"]),
    }),
  );
  store.close();
});
test("diagram validation rejects broken edges and movement stays on its board", () => {
  const n = newNote();
  n.diagram.nodes = [{ id: "a", label: "Motor", x: 40, y: 25 }];
  assert.equal(moveNode(n, "a", -100, -100).diagram.nodes[0].x, 40);
  assert.throws(() =>
    cleanNote({
      ...n,
      diagram: { ...n.diagram, edges: [{ a: "a", b: "missing" }] },
    }),
  );
});
