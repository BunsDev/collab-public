# Terminal Tile Naming

## Problem

Terminal tile titles have three issues:

1. **Restore bug** — after app restart, reattached terminal tiles show "Terminal" instead of their original CWD-based name, because `syncTerminalTileMeta()` only fires for new sessions, not restored ones.
2. **No manual rename** — users cannot override tile titles.
3. **Static titles** — the title is set at creation and never updates (dynamic CWD tracking is deferred to a follow-up).

## Design

### Data model

Two new optional fields on `TileState` in `canvas-persistence.ts`:

```typescript
interface TileState {
  // ...existing fields...
  userTitle?: string;   // manual override, set via rename UI
  autoTitle?: string;   // computed by tile-type logic, persisted for restore
}
```

Title resolution in `getTileLabel()`:

```
userTitle → autoTitle → existing fallback ("Terminal")
```

- `userTitle`: set when the user renames via context menu. Cleared by renaming to empty string (reverts to auto-name).
- `autoTitle`: set on tile creation and refreshed on session restore from `SessionMeta`. For terminal tiles, this is the CWD-based name (parent/basename). Later, process detection would write here.
- Both fields persist in `canvas-state.json`, so titles survive restart before session metadata is re-read.

### Auto-title computation

```typescript
function computeAutoTitle(
  tile: TileState,
  meta?: SessionMeta,
): string | undefined
```

For terminal tiles: returns the raw CWD path from `meta.cwdHostPath ?? meta.cwd`. `getTileLabel()` continues to run this through `splitFilepath()` for the two-span title rendering (parent + basename). For other tile types: returns `undefined` (fallback). Easy to extend later by adding cases per tile type.

`autoTitle` stores the raw path, not a formatted display string. This keeps the existing `splitFilepath` rendering working without special-casing.

### Migration: removing `displayName`

The existing `tile.displayName` field (set by `syncTerminalTileMeta()`, checked by `getTileLabel()`) is replaced by `autoTitle`. As part of this change:

- Remove the `displayName` check from `getTileLabel()`.
- Stop writing `tile.displayName` in `syncTerminalTileMeta()` — write `autoTitle` instead.
- Remove `displayName` from the renderer-side `Tile` typedef.
- No backward-compat shim needed — `displayName` was never persisted in `canvas-state.json` (it was only set at runtime from session metadata), so there's no stored data to migrate.

### Relationship to existing `tile.cwd` field

`tile.cwd` continues to be set by `syncTerminalTileMeta()` for non-title purposes (tooltip, tile-list description). `getTileLabel()` resolution becomes:

1. If `userTitle` is set → return it as-is (single string, no split)
2. If `autoTitle` is set → run through `splitFilepath()` for parent/basename display
3. Fall back to existing `tile.cwd`-based logic (backward compat during migration)
4. Final fallback → "Terminal"

### Restore fix

**On terminal tile creation:**
- After `ptyCreate()` returns, compute `autoTitle` from the session's CWD and store it on the tile.
- Persist to canvas state.

**On app restart:**
- Tiles restored from `canvas-state.json` already have `autoTitle` from persistence, so titles display correctly immediately.
- After `restoreCanvasState()` completes, iterate over restored terminal tiles that have a `ptySessionId`. Call `ptyDiscover()` once to get all live sessions, then call `syncTerminalTileMeta(tile, meta)` for each matching session to refresh `autoTitle` from current metadata.
- This mirrors the existing `onTerminalSessionCreated` pattern but batched for all restored tiles.

### Rename UI

**Context menu:** Attach a `contextmenu` listener to `.tile-title-bar` elements in `createTileDOM()` (tile-renderer.js). Use the existing `showContextMenu` IPC for a native Electron menu, consistent with the canvas context menu pattern.

**Interaction:**
1. Right-click terminal tile header → native context menu shows "Rename".
2. Clicking "Rename" replaces the title text with an inline text input, pre-filled with the current displayed title, auto-selected.
3. Enter or blur to confirm. Escape to cancel (reverts to previous title without modifying `userTitle`).
4. Empty input clears `userTitle` (reverts to auto-name). Non-empty input sets `userTitle`.
5. Persist to canvas state immediately.

No separate "Reset name" menu item — empty string handles the reset case.

No visual indicator distinguishing overridden names from auto-names.

### Key files

| Area | File | Lines |
|------|------|-------|
| Tile state / persistence | `src/main/canvas-persistence.ts` | 11-24 (TileState), 40-66 (load/save) |
| Session metadata | `src/main/tmux.ts` | 6-17 (SessionMeta) |
| Title display | `src/windows/shell/src/tile-renderer.js` | 197-235 (getTileLabel, updateTileTitle) |
| Tile DOM / context menu | `src/windows/shell/src/tile-renderer.js` | createTileDOM() — attach contextmenu listener |
| Tile DOM management | `src/windows/shell/src/tile-manager.js` | 29-365 |
| Canvas state save | `src/windows/shell/src/tile-manager.js` | 49-72 (getCanvasStateForSave — add userTitle, autoTitle) |
| Canvas state restore | `src/windows/shell/src/tile-manager.js` | 624-633 (restoreCanvasState — forward userTitle, autoTitle) |
| Renderer-side tile typedef | `src/windows/shell/src/canvas-state.js` | Tile JSDoc typedef — add fields |
| Metadata sync | `src/windows/shell/src/renderer.js` | 214-222 (syncTerminalTileMeta) |
| Terminal tile creation | `src/main/pty.ts` | 393-525 (createSession) |
| Terminal tile restore | `src/windows/terminal-tile/src/App.tsx` | 54-100 (ptyReconnect) |
| Session reconnect | `src/main/pty.ts` | 536-648 (reconnectSession) |

## Out of scope

- **Dynamic CWD tracking** — no OSC sequence parsing or shell integration. Auto-title is set from CWD at creation and refreshed from persisted metadata on restore, but does not live-update as the user navigates.
- **Process detection for auto-naming** — `getForegroundProcess()` exists but won't feed into `autoTitle` yet. `computeAutoTitle` is where this would plug in later.
- **Rename UI for non-terminal tiles** — the data model supports it (fields are on `TileState`), but the context menu interaction is only added for terminal tiles in this pass.
