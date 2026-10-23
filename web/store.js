import { cleanNote, validatePhoto } from "./model.js";
export async function openNotebook(factory = globalThis.indexedDB) {
  if (!factory) throw Error("IndexedDB is unavailable.");
  const db = await new Promise((resolve, reject) => {
    const r = factory.open("fieldnotes-v1", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("notes", { keyPath: "id" });
      r.result.createObjectStore("photos", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(Error("Close older app tabs and reload to open storage."));
  });
  function all(name) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name),
        r = tx.objectStore(name).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function write(names, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, "readwrite");
      let value, error;
      const done = (v) => (value = v),
        fail = (e) => {
          error = e;
          tx.abort();
        };
      try {
        fn(tx, done, fail);
      } catch (e) {
        fail(e);
      }
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error || tx.error || Error("Write cancelled."));
      tx.onerror = () => reject(tx.error);
    });
  }
  return {
    async notes() {
      return (await all("notes")).map(cleanNote);
    },
    async photos(noteId) {
      return (await all("photos")).filter(
        (p) => !noteId || p.noteId === noteId,
      );
    },
    async save(note, expected = 0) {
      const clean = cleanNote(note);
      return write(["notes"], (tx, done, fail) => {
        const s = tx.objectStore("notes"),
          r = s.get(clean.id);
        r.onsuccess = () => {
          if ((r.result?.revision || 0) !== expected) {
            fail(
              Error(
                "Another tab saved a newer version. Reload the note or save a separate copy.",
              ),
            );
            return;
          }
          const count = s.count();
          count.onsuccess = () => {
            if (!r.result && count.result >= 100) {
              fail(
                Error(
                  "This release supports 100 notes. Export and empty trash before adding more.",
                ),
              );
              return;
            }
            const next = {
              ...clean,
              updated: new Date().toISOString(),
              revision: expected + 1,
            };
            s.put(next);
            done(next);
          };
        };
      });
    },
    async snapshot() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["notes", "photos"], "readonly"),
          n = tx.objectStore("notes").getAll(),
          p = tx.objectStore("photos").getAll();
        tx.oncomplete = () =>
          resolve({ notes: n.result.map(cleanNote), photos: p.result });
        tx.onerror = () => reject(tx.error);
      });
    },
    async addPhoto(p) {
      return write(["notes", "photos"], (tx, done, fail) => {
        const r = tx.objectStore("notes").getAll();
        r.onsuccess = () => {
          try {
            validatePhoto(p, new Set(r.result.map((n) => n.id)));
          } catch (e) {
            fail(e);
            return;
          }
          const ps = tx.objectStore("photos"),
            list = ps.getAll();
          list.onsuccess = () => {
            if (
              list.result.reduce((n, p) => n + p.blob.size, 0) + p.blob.size >
              20 * 1024 * 1024
            ) {
              fail(
                Error(
                  "The workspace photo limit is 20 MB. Export and remove an attachment before adding another.",
                ),
              );
              return;
            }
            ps.put(p);
            done(p);
          };
        };
      });
    },
    async removePhoto(id) {
      return write(["photos"], (tx) => tx.objectStore("photos").delete(id));
    },
    async restore(notes, photos) {
      const clean = notes.map(cleanNote);
      if (
        clean.length > 100 ||
        new Set(clean.map((n) => n.id)).size !== clean.length
      )
        throw Error("Backups support up to 100 unique notes.");
      const ids = new Set(clean.map((n) => n.id));
      photos.forEach((p) => validatePhoto(p, ids));
      if (
        new Set(photos.map((p) => p.id)).size !== photos.length ||
        photos.reduce((n, p) => n + p.blob.size, 0) > 20 * 1024 * 1024
      )
        throw Error("Check photo IDs and the 20 MB workspace quota.");
      return write(["notes", "photos"], (tx) => {
        const ns = tx.objectStore("notes"),
          ps = tx.objectStore("photos"),
          r = ns.getAll();
        r.onsuccess = () => {
          const previous = new Map(r.result.map((n) => [n.id, n.revision]));
          ns.clear();
          ps.clear();
          clean.forEach((n) =>
            ns.put({
              ...n,
              revision: Math.max(
                Date.now(),
                n.revision + 1,
                (previous.get(n.id) || 0) + 1,
              ),
            }),
          );
          photos.forEach((p) => ps.put(p));
        };
      });
    },
    async purgeTrash() {
      return write(["notes", "photos"], (tx) => {
        const ns = tx.objectStore("notes"),
          ps = tx.objectStore("photos"),
          r = ns.getAll();
        r.onsuccess = () => {
          const gone = new Set(
            r.result.filter((n) => n.trashed).map((n) => n.id),
          );
          for (const id of gone) ns.delete(id);
          const p = ps.getAll();
          p.onsuccess = () =>
            p.result
              .filter((p) => gone.has(p.noteId))
              .forEach((p) => ps.delete(p.id));
        };
      });
    },
    close() {
      db.close();
    },
  };
}
export async function encodeBackup(notes, photos) {
  const output = [];
  for (const p of photos) {
    const bytes = new Uint8Array(await p.blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 16384)
      binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
    output.push({
      id: p.id,
      noteId: p.noteId,
      type: p.type,
      caption: p.caption,
      data: btoa(binary),
    });
  }
  return { schema: 1, notes: notes.map(cleanNote), photos: output };
}
export function decodeBackup(raw) {
  if (
    raw?.schema !== 1 ||
    !Array.isArray(raw.notes) ||
    !Array.isArray(raw.photos) ||
    raw.photos.length > 100 ||
    raw.notes.length > 100
  )
    throw Error("This is not a Fieldnotes backup.");
  const notes = raw.notes.map(cleanNote),
    ids = new Set(notes.map((n) => n.id)),
    photos = raw.photos.map((p) => {
      if (typeof p.data !== "string" || p.data.length > 2800000)
        throw Error("A photo exceeds the import limit.");
      const bytes = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
      const photo = {
        id: p.id,
        noteId: p.noteId,
        type: p.type,
        caption: p.caption,
        blob: new Blob([bytes], { type: p.type }),
      };
      return validatePhoto(photo, ids);
    });
  return { notes, photos };
}
