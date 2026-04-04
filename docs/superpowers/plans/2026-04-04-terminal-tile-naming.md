# Terminal Tile Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic auto-titles and manual rename support for terminal tiles, and fix title loss on app restart.

**Architecture:** Two new optional fields (`userTitle`, `autoTitle`) on the tile data model with a layered resolution chain: userTitle > autoTitle > cwd fallback > "Terminal". The existing `displayName` field is removed. Rename happens via right-click context menu with inline editing.

**Tech Stack:** Vanilla JS (renderer), TypeScript (main process), Electron IPC (`showContextMenu`), bun:test

---

### Task 1: Update data model — add `userTitle` and `autoTitle` fields

**Files:**
- Modify: `collab-electron/src/main/canvas-persistence.ts:11-24`
- Modify: `collab-electron/src/windows/shell/src/canvas-state.js:1-17`

- [ ] **Step 1: Write failing tests for new getTileLabel resolution**

Add these tests to `collab-electron/src/windows/shell/src/tile-renderer.test.ts`:

```typescript
test("userTitle wins over autoTitle and cwd", () => {
  const label = getTileLabel({
    type: "term", id: "t1",
    userTitle: "My Server",
    autoTitle: "/Users/me/projects/app",
    cwd: "/Users/me/projects/app",
  });
  expect(label.name).toBe("My Server");
  expect(label.parent).toBe("");
});

test("returns autoTitle split when no userTitle", () => {
  const label = getTileLabel({
    type: "term", id: "t1",
    autoTitle: "/Users/me/projects/app",
  });
  expect(label.name).toBe("app");
  expect(label.parent).toBe("/Users/me/projects/");
});

test("falls back to cwd when no userTitle or autoTitle", () => {
  const label = getTileLabel({
    type: "term", id: "t1",
    cwd: "/Users/me/projects/fallback",
  });
  expect(label.name).toBe("fallback");
  expect(label.parent).toBe("/Users/me/projects/");
});

test("returns Terminal when no title fields set", () => {
  const label = getTileLabel({ type: "term", id: "t1" });
  expect(label.name).toBe("Terminal");
  expect(label.parent).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd collab-electron && bun test src/windows/shell/src/tile-renderer.test.ts`
Expected: new tests fail (userTitle/autoTitle fields not recognized in getTileLabel)

- [ ] **Step 3: Add fields to TileState interface**

In `collab-electron/src/main/canvas-persistence.ts`, add to the `TileState` interface:

```typescript
interface TileState {
  // ...existing fields...
  userTitle?: string;
  autoTitle?: string;
}
```

- [ ] **Step 4: Add fields to renderer-side Tile JSDoc typedef**

In `collab-electron/src/windows/shell/src/canvas-state.js`, update the `Tile` typedef:

```javascript
/**
 * @typedef {Object} Tile
 * @property {string} id
 * @property {TileType} type
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} [filePath]
 * @property {string} [folderPath]
 * @property {string} [url]
 * @property {string} [cwd]
 * @property {string} [ptySessionId]
 * @property {string} [userTitle]
 * @property {string} [autoTitle]
 * @property {number} zIndex
 */
```

- [ ] **Step 5: Update getTileLabel to use new resolution chain**

In `collab-electron/src/windows/shell/src/tile-renderer.js`, replace the term branch of `getTileLabel`:

```javascript
export function getTileLabel(tile) {
  if (tile.type === "term") {
    if (tile.userTitle) return { parent: "", name: tile.userTitle };
    if (tile.autoTitle) return splitFilepath(tile.autoTitle);
    if (tile.cwd) return splitFilepath(tile.cwd);
    return { parent: "", name: "Terminal" };
  }
  // ...rest unchanged
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd collab-electron && bun test src/windows/shell/src/tile-renderer.test.ts`
Expected: all tests pass including old tests (cwd fallback still works)

- [ ] **Step 7: Remove old displayName test**

In `collab-electron/src/windows/shell/src/tile-renderer.test.ts`, remove the test "returns display name for term tiles without cwd" (which checks `displayName`). That field is being removed.

- [ ] **Step 8: Run tests again**

Run: `cd collab-electron && bun test src/windows/shell/src/tile-renderer.test.ts`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add collab-electron/src/main/canvas-persistence.ts \
       collab-electron/src/windows/shell/src/canvas-state.js \
       collab-electron/src/windows/shell/src/tile-renderer.js \
       collab-electron/src/windows/shell/src/tile-renderer.test.ts
git commit -m "feat: add userTitle/autoTitle fields and update title resolution"
```

---

### Task 2: Persist and restore new fields

**Files:**
- Modify: `collab-electron/src/windows/shell/src/tile-manager.js:49-72` (getCanvasStateForSave)
- Modify: `collab-electron/src/windows/shell/src/tile-manager.js:611-663` (restoreCanvasState)

- [ ] **Step 1: Add fields to getCanvasStateForSave**

In `collab-electron/src/windows/shell/src/tile-manager.js`, inside `getCanvasStateForSave()`, add `userTitle` and `autoTitle` to the serialized object:

```javascript
tiles: tiles.map((t) => ({
  id: t.id,
  type: t.type,
  x: safeCoord(t.x),
  y: safeCoord(t.y),
  width: t.width,
  height: t.height,
  filePath: t.filePath,
  folderPath: t.folderPath,
  workspacePath: t.workspacePath,
  ptySessionId: t.ptySessionId,
  url: t.url,
  zIndex: t.zIndex,
  userTitle: t.userTitle,
  autoTitle: t.autoTitle,
})),
```

- [ ] **Step 2: Forward fields in restoreCanvasState for term tiles**

In the `saved.type === "term"` branch of `restoreCanvasState()`, pass the new fields:

```javascript
if (saved.type === "term") {
  const tile = createCanvasTile(
    "term", cx, cy, {
      id: saved.id,
      width: saved.width,
      height: saved.height,
      zIndex: saved.zIndex,
      ptySessionId: saved.ptySessionId,
      userTitle: saved.userTitle,
      autoTitle: saved.autoTitle,
    },
  );
  spawnTerminalWebview(tile);
}
```

- [ ] **Step 3: Commit**

```bash
git add collab-electron/src/windows/shell/src/tile-manager.js
git commit -m "feat: persist and restore userTitle/autoTitle in canvas state"
```

---

### Task 3: Update syncTerminalTileMeta — write autoTitle, remove displayName

**Files:**
- Modify: `collab-electron/src/windows/shell/src/renderer.js:192-238`

- [ ] **Step 1: Add `getTileLabel` to renderer.js imports**

In `collab-electron/src/windows/shell/src/renderer.js`, update the import from `tile-renderer.js` (line 15) to include `getTileLabel`:

```javascript
import { updateTileTitle, getTileLabel } from "./tile-renderer.js";
```

- [ ] **Step 2: Replace syncTerminalTileMeta (full function replacement)**

In `collab-electron/src/windows/shell/src/renderer.js`, replace the entire `syncTerminalTileMeta` function. This removes the old `tile.displayName` write:

```javascript
function syncTerminalTileMeta(tile, meta) {
  if (!meta) return;
  tile.cwd = meta.cwdHostPath || meta.cwd || tile.cwd;
  tile.autoTitle = meta.cwdHostPath || meta.cwd || tile.autoTitle;
  const dom = tileManager.getTileDOMs().get(tile.id);
  if (dom) {
    updateTileTitle(dom, tile);
  }
}
```

Key changes:
- Writes `tile.autoTitle` from CWD path (raw, not formatted) instead of `tile.displayName`
- `tile.cwd` continues to be set for tooltip/tile-list purposes

- [ ] **Step 3: Replace buildTileListEntry term branch (full replacement of term case)**

In `buildTileListEntry`, replace the entire term branch. This removes the old `tile.displayName` reference:

```javascript
if (tile.type === "term") {
  const label = getTileLabel(tile);
  title = label.parent
    ? label.parent + label.name
    : label.name;
  description = tile.cwd || "~";
  status = tile.ptySessionId ? "running" : "idle";
}
```

This uses the same `getTileLabel` resolution chain, so it respects userTitle > autoTitle > cwd > "Terminal".

- [ ] **Step 4: Commit**

```bash
git add collab-electron/src/windows/shell/src/renderer.js
git commit -m "feat: sync autoTitle from session metadata, remove displayName"
```

---

### Task 4: Fix restore bug — sync metadata for restored terminal tiles

**Files:**
- Modify: `collab-electron/src/windows/shell/src/renderer.js` (after restoreCanvasState call)

- [ ] **Step 1: Find where restoreCanvasState is called**

Search for `restoreCanvasState` in `renderer.js` to find where tile restoration happens. The sync logic should be added right after this call.

- [ ] **Step 2: Add batched metadata sync after restore**

After the `restoreCanvasState()` call in `renderer.js`, add a batch sync for all restored terminal tiles:

```javascript
// After restoreCanvasState(savedState.tiles) call:

// Batch-sync metadata for restored terminal tiles
const restoredTermTiles = tiles.filter(
  (t) => t.type === "term" && t.ptySessionId,
);
if (restoredTermTiles.length > 0) {
  const discovered =
    await window.shellApi.ptyDiscover?.() ?? [];
  for (const tile of restoredTermTiles) {
    const session = discovered.find(
      (entry) => entry.sessionId === tile.ptySessionId,
    );
    syncTerminalTileMeta(tile, session?.meta);
  }
}
```

Import `tiles` from `canvas-state.js` if not already imported at the top of the file where this code lives.

- [ ] **Step 3: Verify the restore path is async-compatible**

Check that the function containing `restoreCanvasState()` is async (since `ptyDiscover` returns a Promise). If not, wrap in an async IIFE or make the function async.

- [ ] **Step 4: Commit**

```bash
git add collab-electron/src/windows/shell/src/renderer.js
git commit -m "fix: sync terminal tile metadata on app restore"
```

---

### Task 5: Set autoTitle on new terminal tile creation

**Files:**
- Modify: `collab-electron/src/windows/shell/src/renderer.js` (onTerminalSessionCreated callback)
- Modify: `collab-electron/src/windows/shell/src/tile-manager.js` (saveCanvasDebounced after sync)

- [ ] **Step 1: Update onTerminalSessionCreated to set autoTitle**

The existing `onTerminalSessionCreated` callback in `renderer.js` (around line 337) already calls `syncTerminalTileMeta`, which now sets `autoTitle`. Verify this is the case by reading the current code. The `syncTerminalTileMeta` update from Task 3 should handle this automatically.

- [ ] **Step 2: Trigger a canvas save after metadata sync**

After `syncTerminalTileMeta` runs for a new session, the `autoTitle` needs to be persisted. Check if `saveCanvasDebounced()` is already called after `onTerminalSessionCreated`. If not, add it:

```javascript
async onTerminalSessionCreated(tile) {
  const discovered =
    await window.shellApi.ptyDiscover?.() ?? [];
  const session = discovered.find(
    (entry) => entry.sessionId === tile.ptySessionId,
  );
  syncTerminalTileMeta(tile, session?.meta);
  tileManager.saveCanvasDebounced();
  tileListWebview.send(
    "tile-list:update", buildTileListEntry(tile),
  );
},
```

- [ ] **Step 3: Commit**

```bash
git add collab-electron/src/windows/shell/src/renderer.js
git commit -m "feat: persist autoTitle after new terminal session creation"
```

---

### Task 6: Rename UI — right-click context menu and inline editing

**Files:**
- Modify: `collab-electron/src/windows/shell/src/tile-renderer.js:32-194` (createTileDOM)
- Modify: `collab-electron/src/windows/shell/src/tile-manager.js:416-522` (createCanvasTile — pass rename callback)

- [ ] **Step 1: Add onRename callback parameter to createTileDOM**

In `collab-electron/src/windows/shell/src/tile-renderer.js`, add `onRename` to the callbacks JSDoc and parameter:

```javascript
/**
 * @param {import('./canvas-state.js').Tile} tile
 * @param {object} callbacks
 * @param {(id: string) => void} callbacks.onClose
 * @param {(id: string, e?: MouseEvent) => void} callbacks.onFocus
 * @param {((id: string) => void)|null} [callbacks.onOpenInViewer]
 * @param {((id: string, url: string) => void)|null} [callbacks.onNavigate]
 * @param {((id: string, newTitle: string) => void)|null} [callbacks.onRename]
 */
```

- [ ] **Step 2: Add context menu listener to tile title bar**

In `createTileDOM`, after the title bar is assembled (after `titleBar.appendChild(btnGroup)`, around line 180), add:

```javascript
if (tile.type === "term") {
  titleBar.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const selected = await window.shellApi.showContextMenu([
      { id: "rename", label: "Rename" },
    ]);
    if (selected === "rename" && callbacks.onRename) {
      callbacks.onRename(tile.id);
    }
  });
}
```

- [ ] **Step 3: Add startInlineRename function to tile-renderer.js**

Add a new exported function after `updateTileTitle`:

```javascript
export function startInlineRename(dom, tile, onCommit) {
  const titleText = dom.titleText;
  const currentLabel = getTileLabel(tile);
  const currentName = currentLabel.parent
    ? currentLabel.parent + currentLabel.name
    : currentLabel.name;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "tile-rename-input";
  input.value = tile.userTitle ?? currentName;
  titleText.style.display = "none";
  titleText.parentNode.insertBefore(input, titleText);
  input.select();
  input.focus();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const value = input.value.trim();
    input.remove();
    titleText.style.display = "";
    onCommit(value);
  }

  function cancel() {
    if (committed) return;
    committed = true;
    input.remove();
    titleText.style.display = "";
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  });
  input.addEventListener("blur", () => commit());
  input.addEventListener("mousedown", (e) => e.stopPropagation());
}
```

- [ ] **Step 4: Wire up rename in createCanvasTile**

In `collab-electron/src/windows/shell/src/tile-manager.js`, in the `createTileDOM` call inside `createCanvasTile`, add the `onRename` callback:

```javascript
const dom = createTileDOM(tile, {
  onClose: (id) => closeCanvasTile(id),
  onFocus: (id, e) => { /* ...existing... */ },
  onOpenInViewer: (id) => { /* ...existing... */ },
  onNavigate: (id, url) => { /* ...existing... */ },
  onRename: (id) => {
    const t = getTile(id);
    const d = tileDOMs.get(id);
    if (!t || !d) return;
    startInlineRename(d, t, (newTitle) => {
      if (newTitle === "") {
        delete t.userTitle;
      } else {
        t.userTitle = newTitle;
      }
      updateTileTitle(d, t);
      saveCanvasImmediate();
    });
  },
});
```

Update the import at the top of `tile-manager.js`:

```javascript
import {
  createTileDOM, positionTile, updateTileTitle, getTileLabel,
  startInlineRename,
} from "./tile-renderer.js";
```

- [ ] **Step 5: Add minimal CSS for the rename input**

Find the shell window's CSS file and add:

```css
.tile-rename-input {
  font: inherit;
  font-size: 12px;
  background: var(--bg-secondary, #1e1e1e);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-focus, #007acc);
  border-radius: 3px;
  padding: 1px 4px;
  outline: none;
  width: 100%;
  min-width: 60px;
  box-sizing: border-box;
}
```

- [ ] **Step 6: Commit**

```bash
git add collab-electron/src/windows/shell/src/tile-renderer.js \
       collab-electron/src/windows/shell/src/tile-manager.js \
       collab-electron/src/windows/shell/src/shell.css
git commit -m "feat: add right-click rename for terminal tiles"
```

---

### Task 7: Manual testing and edge cases

- [ ] **Step 1: Verify basic rename flow**

1. Create a terminal tile
2. Right-click the title bar → "Rename"
3. Type "My Server" → Enter
4. Title should show "My Server"
5. Restart app → title should still show "My Server"

- [ ] **Step 2: Verify rename-to-empty resets to auto-name**

1. Right-click renamed tile → "Rename"
2. Clear the input → Enter
3. Title should revert to CWD-based name

- [ ] **Step 3: Verify Escape cancels rename**

1. Right-click tile → "Rename"
2. Type something → Escape
3. Title should remain unchanged

- [ ] **Step 4: Verify restored tiles show correct titles**

1. Create 2-3 terminal tiles in different directories
2. Restart the app
3. All tiles should show their CWD-based names (not "Terminal")

- [ ] **Step 5: Run all tests**

```bash
cd collab-electron && bun test src/windows/shell/src/tile-renderer.test.ts
```

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: address edge cases in terminal tile naming"
```
