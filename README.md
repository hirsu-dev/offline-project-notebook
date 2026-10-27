# Fieldnotes: Offline Project Notebook

Keep project notes, tasks, photos and wiring ideas together. [Open the notebook](https://hrushikbarani-hub.github.io/offline-project-notebook/).

The app stores records in IndexedDB on this browser. It has no account, automatic cloud sync, analytics, upload service or API key. A service worker caches the app shell after the first successful online load so it can reopen without a connection.

## What works

- Notes with project names, tags, full-text search and a trash view.
- Checklists with up to 50 tasks per note.
- A wiring-idea board with labeled components and connections; drag, use arrow keys, or enter positions numerically.
- Local PNG/JPEG/WebP photo attachments and full backup export/import.
- Explicit saves, unsaved-change prompts and revision checks that reject stale edits from another tab.
- Recovery by reloading the latest saved note or saving a separate copy of the note content. Photos stay attached to the original note when making a content copy.

The diagram is a note-taking tool, not a circuit validator. No electrical instructions or real hardware state are inferred. The app starts empty, so no fictional build work is presented as yours.

## Saving and backups

Press Save note or Ctrl/Cmd+S while editing. New tasks and diagram changes are unsaved until you save the note. Photos attach only to an already saved note. Switching notes asks before discarding changes; exporting a backup asks you to save the current draft first.

Backups include saved note content, tasks, diagrams and original photo bytes/metadata. A backup snapshots both object stores in one read transaction. Restore validates records and commits replacement in one transaction. Restored revisions change so an older open tab cannot silently overwrite them. Export before restoring a different notebook or emptying trash.

Moving a saved note to trash preserves its attachments. Emptying trash permanently removes those notes and photos from this app; recovery requires an exported backup. Browser data clearing also removes the notebook. This is local storage, not a substitute for backups. If IndexedDB is blocked, the app explains the storage problem rather than claiming that work was saved.

Limits: 100 notes; 20,000 body characters per note; 10 tags; 40 diagram components and 80 connections per note; 2 MB per photo and 20 MB total photo storage; 40 MB backup imports. PNG/JPEG/WebP MIME types are accepted. Original photo bytes and metadata are preserved locally; they are not anonymized or uploaded.

## Offline behavior

Open the app online once and wait for “offline app cache ready.” Later visits in the same browser/profile can use the cached shell. Saved data is already local. Service workers require HTTPS or localhost. Clearing site data removes both local records and the cached app. An initial offline visit cannot work before the cache has installed.

The worker intercepts only GET requests within this app's scope. It retains the current shell cache and removes only old caches with its own prefix, leaving other apps alone. When changing shell assets, update the cache version in `web/worker.js`. There is no background synchronization with any server; conflict-aware cloud sync remains a separate future milestone.

## Run and check

```powershell
npm ci
npm run check
python -m http.server 8148 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:8148`. Node.js 22+ is required for development checks only. The app has no runtime npm dependency.

Checks cover stale-edit rejection, backup/photo round trips, invalid-import rollback, diagram limits, service-worker scope/cache cleanup/offline navigation fallback and the actual editor/task/diagram workflow. Visual browser, device storage-quota and real offline-reload testing remain outstanding; the worker's logic checks do not replace an offline visit.

`web/model.js` validates note data and diagram geometry. `web/store.js` owns the two IndexedDB stores and backup encoding. `web/app.js` renders the notebook. GitHub Actions checks the source and deploys only `web` to free GitHub Pages.

Built by [hirsu](https://hrushikbarani-hub.github.io/) for software, telescope and Raspberry Pi build notes.
