import { newNote, cleanNote, searchNotes, moveNode, uid } from "./model.js";
import { openNotebook, encodeBackup, decodeBackup } from "./store.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let store,
  notes = [],
  draft = null,
  dirty = false,
  busy = false,
  nodeId = null,
  section = "note",
  urls = [],
  drag = null;
const say = (t) => ($("#message").textContent = t);
function mark() {
  dirty = true;
  const state = $("#save-state");
  if (state) {
    state.textContent = "UNSAVED CHANGES";
    state.classList.add("dirty");
  }
}
function release() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls = [];
}
function canLeave() {
  return (
    !dirty ||
    confirm("This note has unsaved changes. Discard them and continue?")
  );
}
async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    say(e.message);
  } finally {
    busy = false;
  }
}
async function refresh() {
  notes = await store.notes();
  const choice = $("#project").value;
  $("#project").innerHTML =
    '<option value="all">All projects</option>' +
    [...new Set(notes.map((n) => n.project).filter(Boolean))]
      .sort()
      .map((p) => `<option value="${esc(p)}">${esc(p)}</option>`)
      .join("");
  $("#project").value = [...$("#project").options].some(
    (o) => o.value === choice,
  )
    ? choice
    : "all";
  list();
}
function list() {
  const rows = searchNotes(notes, {
    query: $("#query").value,
    project: $("#project").value,
    trash: $("#trash").checked,
  });
  $("#count").textContent =
    `${rows.length} notes${$("#trash").checked ? " in trash" : ""}`;
  $("#note-list").innerHTML =
    rows
      .map(
        (n) =>
          `<button class="note-item" data-note="${n.id}" aria-pressed="${draft?.id === n.id}"><strong>${esc(n.title)}</strong><small>${esc(n.project || "No project")} / ${n.updated.slice(0, 10)}<br/>${n.tasks.filter((t) => t.done).length}/${n.tasks.length} tasks</small></button>`,
      )
      .join("") || '<p class="help">No matching notes.</p>';
  $("#purge").hidden = !$("#trash").checked;
}
function tasks() {
  return (
    draft.tasks
      .map(
        (t) =>
          `<div class="task"><input type="checkbox" data-task="${t.id}" aria-label="Complete ${esc(t.text)}" ${t.done ? "checked" : ""}/><span class="${t.done ? "done" : ""}">${esc(t.text)}</span><button type="button" data-remove-task="${t.id}" aria-label="Remove task ${esc(t.text)}">×</button></div>`,
      )
      .join("") || '<p class="help">Add a first test or next step.</p>'
  );
}
function diagram() {
  const d = draft.diagram;
  $("#diagram-pad").innerHTML =
    `<svg viewBox="0 0 600 340" role="group" aria-label="Wiring idea diagram. Components can be selected and moved with arrow keys or the numeric position fields.">${d.edges
      .map((e) => {
        const a = d.nodes.find((n) => n.id === e.a),
          b = d.nodes.find((n) => n.id === e.b);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      })
      .join(
        "",
      )}${d.nodes.map((n) => `<g data-node="${n.id}" tabindex="0" role="button" aria-label="Component ${esc(n.label)}" class="${nodeId === n.id ? "selected" : ""}"><rect x="${n.x - 38}" y="${n.y - 16}" width="76" height="32" rx="3"/><text x="${n.x}" y="${n.y + 4}" text-anchor="middle">${esc(n.label.slice(0, 12))}</text></g>`).join("")}</svg>`;
  const options =
    '<option value="">Choose component</option>' +
    d.nodes
      .map((n) => `<option value="${n.id}">${esc(n.label)}</option>`)
      .join("");
  for (const selector of ["#node-select", "#edge-a", "#edge-b"]) {
    const el = $(selector),
      old = el.value;
    el.innerHTML = options;
    el.value = selector === "#node-select" ? nodeId || "" : old;
  }
  const n = d.nodes.find((n) => n.id === nodeId);
  $("#node-x").value = n?.x || 40;
  $("#node-y").value = n?.y || 25;
  $("#connections").innerHTML = d.edges
    .map(
      (e, i) =>
        `<button type="button" data-remove-edge="${i}">Remove ${esc(d.nodes.find((n) => n.id === e.a).label)} ↔ ${esc(d.nodes.find((n) => n.id === e.b).label)}</button>`,
    )
    .join("");
}
async function photos() {
  release();
  if (!draft || !draft.revision) {
    $("#photos").innerHTML =
      '<p class="help">Save the note before attaching photos.</p>';
    return;
  }
  const id = draft.id,
    rows = await store.photos(id);
  if (draft?.id !== id) return;
  $("#photos").innerHTML =
    rows
      .map((p) => {
        const url = URL.createObjectURL(p.blob);
        urls.push(url);
        return `<figure class="photo"><img src="${url}" alt="${esc(p.caption || "Project photo")}"/><figcaption>${esc(p.caption || "Project photo")} / ${(p.blob.size / 1024).toFixed(0)} KB</figcaption><button type="button" data-remove-photo="${p.id}">Remove photo</button></figure>`;
      })
      .join("") || '<p class="help">No photos attached.</p>';
}
function show() {
  release();
  if (!draft) {
    $("#editor").innerHTML =
      '<div class="empty"><h1>A place for the work in progress.</h1><p>Keep notes, tasks, project photos and wiring ideas together. Create a note to start. Nothing is preloaded or uploaded.</p></div>';
    return;
  }
  nodeId = draft.diagram.nodes[0]?.id || null;
  $("#editor").innerHTML =
    `<article class="editor-card"><div class="editor-head"><span id="save-state">${draft.revision ? "SAVED LOCALLY / REV " + draft.revision : "NEW NOTE / SAVE TO KEEP"}</span><button type="button" id="save" class="primary">Save note</button><button type="button" id="copy">Save a copy</button><button type="button" id="reload">Reload saved note</button><button type="button" id="trash-note">${draft.trashed ? "Restore from trash" : "Move to trash"}</button></div><div class="meta"><label>Title<input name="title" value="${esc(draft.title)}" maxlength="120"/></label><label>Project<input name="project" value="${esc(draft.project)}" maxlength="100"/></label><label>Tags (comma separated)<input name="tags" value="${esc(draft.tags.join(", "))}" maxlength="300"/></label></div><div class="tabs" role="tablist" aria-label="Note contents">${[
      ["note", "Note"],
      ["tasks", "Checklist"],
      ["diagram", "Wiring idea"],
      ["photos", "Photos"],
    ]
      .map(
        ([id, title]) =>
          `<button type="button" role="tab" id="tab-${id}" data-section="${id}" aria-controls="panel-${id}" aria-selected="${section === id}" tabindex="${section === id ? 0 : -1}">${title}</button>`,
      )
      .join(
        "",
      )}</div><section id="panel-note" role="tabpanel" aria-labelledby="tab-note" ${section === "note" ? "" : "hidden"}><label>Project notes<textarea name="body" class="note-body" maxlength="20000" placeholder="What are you building? What did you learn? What should you try next?">${esc(draft.body)}</textarea></label></section><section id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" ${section === "tasks" ? "" : "hidden"}><h2>The next useful steps.</h2><div class="task-add"><label class="sr-only" for="task-text">New task</label><input id="task-text" maxlength="200" placeholder="A test, a part to check, a small next step…"/><button type="button" id="add-task">Add task</button></div><div id="tasks">${tasks()}</div></section><section id="panel-diagram" role="tabpanel" aria-labelledby="tab-diagram" ${section === "diagram" ? "" : "hidden"}><h2>A wiring idea, made visible.</h2><p class="help">Labels and connections are your notes, not validated electrical instructions. Drag a component, use its arrow keys, or change its position below.</p><div class="diagram-layout"><div id="diagram-pad" class="diagram-pad"></div><div class="diagram-tools"><label>Selected component<select id="node-select"></select></label><div class="pair"><label>X<input id="node-x" type="number" min="40" max="560"/></label><label>Y<input id="node-y" type="number" min="25" max="315"/></label></div><button type="button" id="remove-node">Remove component</button></div></div><div class="diagram-add"><label>Component label<input id="node-label" maxlength="60" placeholder="Controller, motor, sensor…"/></label><button type="button" id="add-node">Add component</button></div><div class="connection-add"><label>From<select id="edge-a"></select></label><label>To<select id="edge-b"></select></label><button type="button" id="add-edge">Connect components</button></div><div id="connections" class="connections"></div></section><section id="panel-photos" role="tabpanel" aria-labelledby="tab-photos" ${section === "photos" ? "" : "hidden"}><h2>Keep the real build in view.</h2><div class="photo-add"><label>PNG, JPEG or WebP / up to 2 MB<input id="photo-file" type="file" accept="image/png,image/jpeg,image/webp"/></label><label>Photo description<input id="photo-caption" maxlength="200" placeholder="Describe the important part of the photo"/></label></div><p class="help">Photos stay local. The workspace limit is 20 MB; export backups include their original bytes and metadata.</p><div id="photos" class="photos"></div></section><p class="help">Save explicitly, or use Ctrl/Cmd+S while editing. Switching notes asks before discarding changes. A newer saved revision in another tab causes a conflict instead of being silently replaced.</p></article>`;
  diagram();
  photos();
}
function collect() {
  if (!draft) return;
  draft.title = $('[name="title"]').value;
  draft.project = $('[name="project"]').value;
  draft.tags = $('[name="tags"]')
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  draft.body = $('[name="body"]').value;
}
async function save(copy = false) {
  collect();
  const row = copy
    ? {
        ...draft,
        id: uid(),
        created: new Date().toISOString(),
        revision: 0,
        title: draft.title.slice(0, 115) + " copy",
      }
    : draft;
  draft = await store.save(cleanNote(row), copy ? 0 : draft.revision);
  dirty = false;
  await refresh();
  show();
  say("Note saved locally.");
}
$("#new-note").addEventListener("click", () =>
  run(async () => {
    if (!canLeave()) return;
    draft = newNote();
    dirty = false;
    section = "note";
    show();
    list();
    $('[name="title"]').focus();
  }),
);
$("#note-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-note]");
  if (!b) return;
  run(async () => {
    if (!canLeave()) return;
    await refresh();
    draft = structuredClone(notes.find((n) => n.id === b.dataset.note));
    dirty = false;
    show();
    list();
  });
});
for (const id of ["query", "project", "trash"])
  $("#" + id).addEventListener("input", list);
$("#editor").addEventListener("input", (e) => {
  if (
    e.target.matches(
      '[name="title"],[name="project"],[name="tags"],[name="body"]',
    )
  ) {
    collect();
    mark();
  } else if (e.target.dataset.task) {
    const t = draft.tasks.find((t) => t.id === e.target.dataset.task);
    t.done = e.target.checked;
    mark();
    $("#tasks").innerHTML = tasks();
  } else if (["node-x", "node-y"].includes(e.target.id)) {
    const n = draft.diagram.nodes.find((n) => n.id === nodeId);
    if (n) {
      n.x = Math.max(40, Math.min(560, Number($("#node-x").value) || 40));
      n.y = Math.max(25, Math.min(315, Number($("#node-y").value) || 25));
      mark();
      diagram();
    }
  }
});
$("#editor").addEventListener("change", (e) => {
  if (e.target.id === "node-select") {
    nodeId = e.target.value;
    diagram();
  } else if (e.target.id === "photo-file")
    run(async () => {
      try {
        if (!draft.revision)
          throw Error("Save this note before adding a photo.");
        const file = e.target.files[0];
        if (!file) return;
        await store.addPhoto({
          id: uid(),
          noteId: draft.id,
          type: file.type,
          caption: $("#photo-caption").value.trim(),
          blob: file,
        });
        await photos();
        say("Photo stored locally.");
      } finally {
        e.target.value = "";
      }
    });
});
$("#editor").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  run(async () => {
    if (b.dataset.section) {
      section = b.dataset.section;
      document.querySelectorAll("[data-section]").forEach((t) => {
        t.setAttribute("aria-selected", String(t.dataset.section === section));
        t.tabIndex = t.dataset.section === section ? 0 : -1;
        $("#panel-" + t.dataset.section).hidden = t.dataset.section !== section;
      });
    } else if (b.id === "save") await save();
    else if (b.id === "copy") await save(true);
    else if (b.id === "reload") {
      if (!canLeave()) return;
      await refresh();
      const n = notes.find((n) => n.id === draft.id);
      if (!n) throw Error("This note has not been saved yet.");
      draft = structuredClone(n);
      dirty = false;
      show();
      say("Latest saved version loaded.");
    } else if (b.id === "trash-note") {
      if (!canLeave()) return;
      const latest = (await store.notes()).find((n) => n.id === draft.id);
      if (!latest) {
        draft = null;
        dirty = false;
        show();
        list();
        say("Unsaved note discarded.");
        return;
      }
      draft = { ...latest, trashed: !latest.trashed };
      draft = await store.save(draft, draft.revision);
      dirty = false;
      await refresh();
      show();
      say(
        draft.trashed
          ? "Note moved to trash. Photos stay attached."
          : "Note restored.",
      );
    } else if (b.id === "add-task") {
      const text = $("#task-text").value.trim();
      if (!text) return;
      if (draft.tasks.length >= 50)
        throw Error("A note supports up to 50 tasks.");
      draft.tasks.push({ id: uid(), text, done: false });
      $("#task-text").value = "";
      $("#tasks").innerHTML = tasks();
      mark();
    } else if (b.dataset.removeTask) {
      draft.tasks = draft.tasks.filter((t) => t.id !== b.dataset.removeTask);
      $("#tasks").innerHTML = tasks();
      mark();
    } else if (b.id === "add-node") {
      const label = $("#node-label").value.trim();
      if (!label) return;
      if (draft.diagram.nodes.length >= 40)
        throw Error("A note supports up to 40 components.");
      const p = {
        id: uid(),
        label,
        x: 100 + (draft.diagram.nodes.length % 4) * 120,
        y: 80 + (Math.floor(draft.diagram.nodes.length / 4) % 4) * 60,
      };
      draft.diagram.nodes.push(p);
      nodeId = p.id;
      $("#node-label").value = "";
      diagram();
      mark();
    } else if (b.id === "remove-node") {
      draft.diagram.nodes = draft.diagram.nodes.filter((n) => n.id !== nodeId);
      draft.diagram.edges = draft.diagram.edges.filter(
        (e) => e.a !== nodeId && e.b !== nodeId,
      );
      nodeId = draft.diagram.nodes[0]?.id || null;
      diagram();
      mark();
    } else if (b.id === "add-edge") {
      const a = $("#edge-a").value,
        b = $("#edge-b").value;
      if (!a || !b || a === b) throw Error("Choose two different components.");
      if (
        draft.diagram.edges.some(
          (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
        )
      )
        throw Error("Those components are already connected.");
      if (draft.diagram.edges.length >= 80)
        throw Error("A note supports 80 connections.");
      draft.diagram.edges.push({ a, b });
      diagram();
      mark();
    } else if (b.dataset.removeEdge !== undefined) {
      draft.diagram.edges.splice(Number(b.dataset.removeEdge), 1);
      diagram();
      mark();
    } else if (b.dataset.removePhoto) {
      await store.removePhoto(b.dataset.removePhoto);
      await photos();
      say("Photo removed from this notebook.");
    }
  });
});
$("#editor").addEventListener("keydown", (e) => {
  if (
    e.target.matches('[role="tab"]') &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = [...document.querySelectorAll('[role="tab"]')],
      at = tabs.indexOf(e.target),
      i =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (at + (e.key === "ArrowLeft" ? tabs.length - 1 : 1)) %
              tabs.length;
    tabs[i].click();
    tabs[i].focus();
  }
  const g = e.target.closest("[data-node]");
  if (
    g &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    nodeId = g.dataset.node;
    draft = moveNode(
      draft,
      nodeId,
      e.key === "ArrowLeft" ? -10 : e.key === "ArrowRight" ? 10 : 0,
      e.key === "ArrowUp" ? -10 : e.key === "ArrowDown" ? 10 : 0,
    );
    diagram();
    document.querySelector(`[data-node="${nodeId}"]`)?.focus();
    mark();
  }
});
$("#editor").addEventListener("pointerdown", (e) => {
  const g = e.target.closest("[data-node]");
  if (!g) return;
  nodeId = g.dataset.node;
  const pad = $("#diagram-pad"),
    rect = pad.getBoundingClientRect();
  drag = { rect, pointer: e.pointerId };
  pad.setPointerCapture(e.pointerId);
  diagram();
});
$("#editor").addEventListener("pointermove", (e) => {
  if (!drag || !drag.rect.width) return;
  const n = draft.diagram.nodes.find((n) => n.id === nodeId);
  n.x = Math.max(
    40,
    Math.min(560, ((e.clientX - drag.rect.left) / drag.rect.width) * 600),
  );
  n.y = Math.max(
    25,
    Math.min(315, ((e.clientY - drag.rect.top) / drag.rect.height) * 340),
  );
  diagram();
  mark();
});
for (const name of ["pointerup", "pointercancel"])
  $("#editor").addEventListener(name, () => (drag = null));
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && draft) {
    e.preventDefault();
    run(() => save());
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty || busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  release();
  store?.close();
});
$("#backup").addEventListener("click", () =>
  run(async () => {
    if (dirty) throw Error("Save the current note before exporting a backup.");
    const snapshot = await store.snapshot();
    const value = await encodeBackup(snapshot.notes, snapshot.photos),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(value)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "fieldnotes-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("Backup includes saved notes, tasks, diagrams and photo bytes.");
  }),
);
$("#restore").addEventListener("change", (e) =>
  run(async () => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 40000000) throw Error("Use a backup smaller than 40 MB.");
      const { notes, photos } = decodeBackup(JSON.parse(await file.text()));
      if (
        !confirm(
          `Replace this app's notebook with ${notes.length} notes and ${photos.length} photos? Export the current notebook first.`,
        )
      )
        return;
      await store.restore(notes, photos);
      draft = null;
      dirty = false;
      await refresh();
      show();
      say("Backup restored atomically.");
    } finally {
      e.target.value = "";
    }
  }),
);
$("#purge").addEventListener("click", () =>
  run(async () => {
    if (
      !confirm(
        "Permanently empty this notebook's trash and remove its attached photos? Export a backup first.",
      )
    )
      return;
    await store.purgeTrash();
    if (draft?.trashed) {
      draft = null;
      dirty = false;
      show();
    }
    await refresh();
    say(
      "Trash emptied. An exported backup is required to recover purged records.",
    );
  }),
);
async function init() {
  try {
    store = await openNotebook();
    await refresh();
    show();
    $("#offline-status").textContent =
      "LOCAL NOTES / PREPARING OFFLINE APP CACHE";
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./worker.js", { scope: "./" })
        .then(() => navigator.serviceWorker.ready)
        .then(
          () =>
            ($("#offline-status").textContent =
              "LOCAL NOTES / OFFLINE APP CACHE READY"),
        )
        .catch(
          () =>
            ($("#offline-status").textContent =
              "LOCAL NOTES / OFFLINE CACHE UNAVAILABLE"),
        );
    } else
      $("#offline-status").textContent =
        "LOCAL NOTES / OFFLINE CACHE UNSUPPORTED";
  } catch (e) {
    say(
      e.message +
        " Existing data was not changed. Enable browser storage and reload.",
    );
    $("#editor").innerHTML =
      '<div class="empty"><h1>Local storage is unavailable.</h1><p>The notebook needs IndexedDB to save notes and photos. Enable site storage and reload.</p></div>';
    document
      .querySelectorAll("button,input,select")
      .forEach((b) => (b.disabled = true));
  }
}
init();
