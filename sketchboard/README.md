# sketchboard

A local infinite-canvas whiteboard in the spirit of Excalidraw. There's no sign-up and no collaboration, and nothing leaves your machine. A small local service keeps every drawing in one SQLite database, and a **Home** page lists, searches and organises them.

## Requirements

Node **22.5+**, which has SQLite built in (`node:sqlite`). This machine has Node 24 LTS at `~/.local/share/sketchboard/node`; the scripts below use it automatically.

## Production (runs at startup)

```bash
npm run service:install
```

This builds the app and installs a systemd **user** service (`~/.config/systemd/user/sketchboard.service`, no root needed) at **http://localhost:5183**. Lingering is enabled, so it starts at boot rather than at login, and it restarts automatically if it crashes. It only listens on loopback (127.0.0.1 and ::1), so other machines can't reach it.

| Task | Command |
| --- | --- |
| Ship code changes | `npm run deploy` (rebuild + restart) |
| Status / logs | `systemctl --user status sketchboard` · `journalctl --user -u sketchboard -f` |
| Stop / start | `systemctl --user stop sketchboard` · `systemctl --user start sketchboard` |
| Change port | `PORT=5190 npm run service:install` |
| Remove | `npm run service:uninstall` (your data stays) |

### Where your data lives

| Path | What |
| --- | --- |
| `~/.local/share/sketchboard/sketchboard.db` | every drawing, version, image, library item and preference |
| `~/.local/share/sketchboard/backups/` | a copy of the database each day (14 daily + 8 weekly kept), plus *Back up now* copies |

To restore a backup: `systemctl --user stop sketchboard`, copy the backup over `sketchboard.db` (and delete `sketchboard.db-wal` / `-shm`), then `systemctl --user start sketchboard`.

The first time a browser opens the app, anything that browser kept from before the database existed (its drawing, version history, library and preferences) is moved in automatically. Each browser migrates once, and the old browser copy is left untouched.

## Development

```bash
npm install
npm run dev:all
```

This starts Vite at http://localhost:5184 with `/api` proxied to a dev API on :5185. The dev API uses its **own** database (`~/.local/share/sketchboard/dev/`), so testing never touches your real drawings. `npm run dev` and `npm run dev:api` run the two halves separately.

```bash
npm run test:api     # API + security tests against a temporary database
npm run lint
npm run build
```

### How it fits together

- `server/` is the local service, built on Node's own modules only:
  - `db.mjs`: schema and migrations
  - `store.mjs`: projects, revisions, versions, images, search
  - `api.mjs`: routes and same-origin protection
  - `folders.mjs`: registered folders and linked files
  - `backup.mjs`: backups
  - `static.mjs`: serves the built app
- `deploy/serve.mjs` is the entry point; it reads `PORT`, `SKETCHBOARD_DATA`, `API_ONLY`, `EXTRA_PORTS` and `BACKUPS`.
- `src/project.ts` holds the open project: auto-save with revision checks, the offline queue, live updates from other windows, and routing (`#/` for Home, `#/p/<id>` for a drawing).
- **Security:** other websites can send requests to localhost, so the service checks four things on every request:
  - the `Host` header must be its own address (stops DNS rebinding),
  - a foreign `Origin` is refused, and so is `Sec-Fetch-Site: cross-site`,
  - every API call must carry `X-Sketchboard: 1`,
  - file access is confined to folders you registered.

## Home

- **Continue** where you left off, start from a **blank drawing or template**, **Open file…** (Ctrl+O) to import `.json` files, or drop them anywhere on the page.
- **Search** (press `/`) matches drawing names *and* all the text inside them, with highlighted snippets.
- **Pinned** and **Recent** cards show a preview, when it was last edited, and the page count. The ⋯ menu has Rename, Duplicate, Pin, Export `.json`, Link to a file, and Move to Trash.
- **Folders**: register the folders where you keep `.json` drawings (⚙ → Folders & backups). Home lists every drawing in them, subfolders included, with **Import** or **Import & link**.
- **Trash** keeps deleted drawings for 30 days.
- Keyboard: arrow keys move between cards, Enter opens, `N` starts a new drawing.

## Saving, files and conflicts

- Everything **auto-saves** to the service as you work. The chip at the top left shows the status, the name (click to rename), and a ⌂ button back to Home.
- **Ctrl+S** saves now and adds a checkpoint to version history. **Ctrl+Shift+S** exports a self-contained `.json` (images embedded) for sharing or another machine.
- **Linked files** (optional): link a drawing to a `.json` in a registered folder, and the service rewrites that file on every save. That's handy for a git repo or a synced folder. If the file changes outside sketchboard (a `git pull`, a sync), you're asked to **Reload from file** or **Keep mine**. The file is never overwritten until you decide, and the other version always goes into history.
- **Two windows on one drawing:** each follows the other's edits. If both change it at once, you choose which to keep, and the other is saved in version history.
- **Service unreachable?** Edits are kept in this browser (the chip says *Offline*) and sent when the service is back, even after a reload.

## Features

**Drawing**
- Hand-drawn (rough.js) rectangles, diamonds, ellipses, arrows, lines, freehand pen (pressure-aware), text, sticky notes, images, eraser, laser pointer
- Arrows **bind** to shapes and follow them when moved; straight, curved and **elbow** connectors; drag a line's midpoint to add a bend
- Text inside any rectangle/diamond/ellipse (double-click or Enter), auto-wrapping and auto-growing
- Fonts: Excalidraw's own Excalifont, Virgil and Comic Shanns plus Nunito, Lilita One, Cascadia Code and more built in (offline), and a searchable picker covering the full Google Fonts catalog (~1,600 families, loaded on demand when online)
- Text formatting: size, bold, italic, underline, strikethrough, alignment, separate text color inside shapes
- Full style controls, eyedropper, recent colors

**Organizing**
- **Frames**: named containers that clip and carry their contents
- **Multiple pages** per drawing
- Snapping to other elements' edges/centers with guides (hold Ctrl to bypass), or to the grid
- Group, lock, flip, layer ordering, alt-drag to duplicate
- **Library**: save selections for reuse; click or drag to insert; import/export library files
- **Templates**: flowchart, kanban, mind map, wireframe, brainstorm, timeline

**Links & embeds**
- Hyperlinks on any element (Ctrl+K), link badges, Ctrl+click to open; linked text is underlined
- **Web embeds**: YouTube, Vimeo, Loom, Figma, CodePen, CodeSandbox, Spotify, Google Docs/Maps, or any https URL; double-click to interact
- Pasting a URL creates an embed for known providers, linked text otherwise

**Navigation & tools**
- Infinite pan/zoom, pinch-zoom and two-finger pan on touch, minimap, zoom to fit/selection
- Find across all pages (Ctrl+F)
- Stats panel with editable position/size/angle (Alt+/)
- Right-click context menu
- Light/dark theme, canvas background color
- Export PNG (1–4× scale, transparent or with background, dark mode) or SVG; copy PNG/SVG to clipboard

Press **?** in the app for the full shortcut list.

## Version history

Open it with the clock button (top right) or **Alt+H**. Each drawing has its own history, stored in the database.

- **Automatic versions** every 5 minutes while you edit, whenever you leave the tab, and on every Ctrl+S.
- **Safety copies** before Clear page, Delete page, Restore, and resolving a conflict or linked-file change. They're kept at least a week.
- **Named versions** via *Save version…* (or name any existing one from its ⋯ menu) are never deleted.
- Automatic versions are thinned over time: every 5 min for the last hour, hourly for a day, daily for a month, weekly after that. Images are stored once and shared.
- Click a version to **preview** it read-only, then **Restore** it (the current state is kept as a version), **Copy page** into the current drawing, or go **Back** (Esc).

## Showcase

The DeepSeek-R1 showcase is already in your library. It's a 12-page breakdown of the paper (arXiv:2501.12948) that uses nearly every feature, and its last page lays all the other pages out as frames on one canvas. The original file is `../showcase/deepseek-r1-showcase.sketchboard.json`.

## Font credits

Excalifont, Virgil, Cascadia Code and Liberation Sans (SIL Open Font License 1.1) and Comic Shanns (MIT) come from the [Excalidraw](https://github.com/excalidraw/excalidraw) project. Kalam, Inter, Fira Code, Nunito and Lilita One are bundled via Fontsource (OFL). Google Fonts are fetched from fonts.googleapis.com only when you pick or preview one.

## Known limitations

- Embeds are live iframes layered above the canvas, so other elements can't be drawn on top of them.
- Some sites refuse to be embedded and show an error inside the frame.
- Text formatting applies to a whole text block, not individual words.
- The app needs the local service running; the built `dist/` folder no longer works on its own.
