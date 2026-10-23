export const uid = () => crypto.randomUUID();
export function newNote() {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: "Untitled note",
    project: "",
    tags: [],
    body: "",
    created: now,
    updated: now,
    revision: 0,
    trashed: false,
    tasks: [],
    diagram: { nodes: [], edges: [] },
  };
}
const text = (v, n) => typeof v === "string" && v.length <= n;
const validId = (v) => typeof v === "string" && /^[\w-]{1,80}$/.test(v);
export function cleanNote(n) {
  if (
    !validId(n?.id) ||
    !text(n.title, 120) ||
    !n.title.trim() ||
    !text(n.project, 100) ||
    !text(n.body, 20000) ||
    !Array.isArray(n.tags) ||
    n.tags.length > 10 ||
    n.tags.some((t) => !text(t, 30)) ||
    !Number.isSafeInteger(n.revision) ||
    n.revision < 0 ||
    typeof n.trashed !== "boolean" ||
    ![n.created, n.updated].every(
      (v) => typeof v === "string" && Number.isFinite(+new Date(v)),
    )
  )
    throw Error("Check the note's title, text, dates and tags.");
  if (
    !Array.isArray(n.tasks) ||
    n.tasks.length > 50 ||
    n.tasks.some(
      (t) =>
        !validId(t.id) || !text(t.text, 200) || typeof t.done !== "boolean",
    ) ||
    new Set(n.tasks.map((t) => t.id)).size !== n.tasks.length
  )
    throw Error("Check the task list (up to 50 tasks).");
  const d = n.diagram;
  if (
    !d ||
    !Array.isArray(d.nodes) ||
    !Array.isArray(d.edges) ||
    d.nodes.length > 40 ||
    d.edges.length > 80 ||
    new Set(d.nodes.map((p) => p.id)).size !== d.nodes.length
  )
    throw Error("Check diagram limits (40 nodes, 80 connections).");
  if (
    d.nodes.some(
      (p) =>
        !validId(p.id) ||
        !text(p.label, 60) ||
        !p.label.trim() ||
        !Number.isFinite(p.x) ||
        p.x < 40 ||
        p.x > 560 ||
        !Number.isFinite(p.y) ||
        p.y < 25 ||
        p.y > 315,
    ) ||
    d.edges.some(
      (e) =>
        e.a === e.b ||
        !d.nodes.some((n) => n.id === e.a) ||
        !d.nodes.some((n) => n.id === e.b),
    )
  )
    throw Error("Check diagram coordinates and connections.");
  if (
    new Set(d.edges.map((e) => [e.a, e.b].sort().join(":"))).size !==
    d.edges.length
  )
    throw Error("A connection is duplicated.");
  return {
    id: n.id,
    title: n.title.trim(),
    project: n.project.trim(),
    tags: [...new Set(n.tags.map((t) => t.trim()).filter(Boolean))],
    body: n.body,
    created: new Date(n.created).toISOString(),
    updated: new Date(n.updated).toISOString(),
    revision: n.revision,
    trashed: n.trashed,
    tasks: n.tasks.map((t) => ({ id: t.id, text: t.text, done: t.done })),
    diagram: {
      nodes: d.nodes.map((p) => ({ id: p.id, label: p.label, x: p.x, y: p.y })),
      edges: d.edges.map((e) => ({ a: e.a, b: e.b })),
    },
  };
}
export function searchNotes(
  notes,
  { query = "", project = "all", trash = false } = {},
) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return notes
    .filter(
      (n) =>
        n.trashed === trash &&
        (project === "all" || n.project === project) &&
        terms.every((t) =>
          [n.title, n.project, n.body, ...n.tags, ...n.tasks.map((t) => t.text)]
            .join(" ")
            .toLowerCase()
            .includes(t),
        ),
    )
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
export function moveNode(note, id, dx, dy) {
  const n = structuredClone(note),
    p = n.diagram.nodes.find((p) => p.id === id);
  if (!p) throw Error("Node not found.");
  p.x = Math.max(40, Math.min(560, p.x + dx));
  p.y = Math.max(25, Math.min(315, p.y + dy));
  return n;
}
export function validatePhoto(p, noteIds) {
  if (
    !validId(p?.id) ||
    !noteIds.has(p.noteId) ||
    !["image/jpeg", "image/png", "image/webp"].includes(p.type) ||
    !text(p.caption, 200) ||
    !(p.blob instanceof Blob) ||
    p.blob.size > 2 * 1024 * 1024
  )
    throw Error(
      "Use a PNG, JPEG or WebP photo up to 2 MB, attached to an existing note.",
    );
  return p;
}
