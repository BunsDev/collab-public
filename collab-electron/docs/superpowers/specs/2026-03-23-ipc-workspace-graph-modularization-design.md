# ipc.ts & workspace-graph.ts Modularization

## workspace-graph.ts (1,529 lines → 2 files)

Extract the Python import analysis pipeline into its own module. The JS/TS pipeline, file collection, entry point, and utilities stay in workspace-graph.ts.

### `workspace-graph-python.ts` (~890 lines)

All 19 Python-specific functions. Exports:

```ts
export function buildPythonImportLinks(
  pythonFiles: CollectedFile[],
  workspacePath: string,
  idMap: Map<string, string>,
): Promise<WorkspaceGraphLink[]>
```

Also exports types needed by the main module: `PythonImportContext`, `PythonImportStatement`, `PythonFileInfo`, `PythonModuleEntry`, `PythonRootCandidate`.

Internal functions (not exported):
- `buildPythonImportContext`, `listPythonRoots`, `listPythonConfigPaths`, `collectPythonConfigPaths`
- `addPythonRootCandidate`, `comparePythonRoots`, `listAncestorPaths`, `extractPythonPackageRoots`
- `normalizePythonRootPath`, `createPythonFileInfo`, `getParentModuleName`
- `extractPythonImportStatements`, `parsePythonImportStatement`, `splitImportList`
- `resolvePythonImportTargets`, `resolvePythonFromBaseModule`, `splitPythonModuleName`
- `joinPythonModuleName`, `joinPythonModuleParts`, `resolvePythonModuleTarget`, `comparePythonModuleEntries`

Imports `@lezer/python` parser (moves from workspace-graph.ts), `@lezer/common` for SyntaxNodeRef, `node:path`, `node:fs/promises`.

### Updated `workspace-graph.ts` (~640 lines)

Keeps: `buildWorkspaceGraph` (entry point), `collectFiles`, `buildCodeImportLinks`, all JS/TS functions (9), `isPathWithinDirectory`, `normalizeCruiserPath`, constants, interfaces.

Adds: `import { buildPythonImportLinks } from "./workspace-graph-python"`.

Exports shared types (`CollectedFile`, `WorkspaceGraphLink`, `WorkspaceGraphNode`, `WorkspaceGraphData`) and utility `isPathWithinDirectory` that Python module also needs.

---

## ipc.ts (1,334 lines → 6 files)

Split 50+ IPC handlers into 5 domain files + thin registry. Each domain file exports a `register*` function that receives shared dependencies and registers its own IPC handlers.

### Shared dependencies object

```ts
interface IpcContext {
  mainWindow: () => BrowserWindow | null;
  getActiveWorkspacePath: () => string | null;
  getWorkspaceConfig: (path: string) => WorkspaceConfig;
  fileFilter: () => FileFilter | null;
  forwardToWebview: (target: string, channel: string, ...args: unknown[]) => void;
  trackEvent: (name: string, props?: Record<string, unknown>) => void;
}
```

Created by `ipc.ts` and passed to each domain register function.

### `ipc-filesystem.ts` (~350 lines)

Filesystem + image operations.

```ts
export function registerFilesystemHandlers(ctx: IpcContext): void
```

**Handlers:** `fs:readdir`, `fs:count-files`, `fs:readfile`, `fs:writefile`, `fs:rename`, `fs:stat`, `fs:trash`, `fs:mkdir`, `fs:move`, `fs:read-folder-table`, `image:thumbnail`, `image:full`, `image:resolve-path`, `image:save-dropped`.

Imports: `./files`, `./image-service`, `./file-filter`.

### `ipc-workspace.ts` (~300 lines)

Workspace management, config, preferences, workspace service lifecycle.

```ts
export function registerWorkspaceHandlers(ctx: IpcContext, appConfig: AppConfig): void
```

**Handlers:** `config:get`, `app:version`, `workspace:list`, `workspace:add`, `workspace:remove`, `workspace:switch`, `workspace-pref:get`, `workspace-pref:set`, `shell:get-workspace-path`, `workspace:read-tree`, `workspace:update-frontmatter`.

Contains `startWorkspaceServices()` and `stopWorkspaceServices()` since they're tightly coupled to workspace switching.

Imports: `./config`, `./workspace-config`, `./watcher`, `./file-filter`, `./wikilink-index`, `./agent-activity`.

### `ipc-knowledge.ts` (~250 lines)

Wikilinks, workspace graph, navigation, file selection.

```ts
export function registerKnowledgeHandlers(ctx: IpcContext): void
```

**Handlers:** `wikilink:resolve`, `wikilink:suggest`, `wikilink:backlinks`, `workspace:get-graph`, `nav:get-selected-file`, `nav:select-file`, `nav:select-folder`, `nav:open-in-terminal`, `nav:create-graph-tile`.

Imports: `./wikilink-index`, `./workspace-graph`.

### `ipc-canvas.ts` (~150 lines)

Canvas persistence, drag-drop coordination, pinch zoom.

```ts
export function registerCanvasHandlers(ctx: IpcContext): void
```

**Handlers:** `canvas:load-state`, `canvas:save-state`, `canvas:forward-pinch`, `drag:set-paths`, `drag:clear-paths`, `drag:get-paths`.

Imports: `./canvas-persistence`.

### `ipc-misc.ts` (~150 lines)

Dialogs, git replay, agent activity, external integration, analytics.

```ts
export function registerMiscHandlers(ctx: IpcContext): void
```

**Handlers:** `dialog:open-folder`, `dialog:open-image`, `dialog:confirm`, `context-menu:show`, `shell:open-external`, `replay:start`, `replay:stop`, `import:web-article`, `agent:focus-session`, `viewer:run-in-terminal`.

Also registers JSON-RPC methods: `agent.sessionStart`, `agent.fileTouched`, `agent.sessionEnd`, `app.notify`.

Imports: `./git-replay`, `./import-service`, `./agent-activity`, `./json-rpc-server`, `./analytics`.

### Updated `ipc.ts` (~150 lines)

Thin registry:
1. Creates shared state (`mainWindow`, `wsConfigMap`, `fileFilter`, `pendingDragPaths`, `recentlyRenamedRefCounts`)
2. Builds `IpcContext` object
3. Calls all 5 `register*` functions
4. Exports `setMainWindow` and `registerIpcHandlers`

## Migration strategy

All extractions are independent — agents create new files in parallel, then ipc.ts and workspace-graph.ts are rewritten as thin orchestrators.

1. Extract `workspace-graph-python.ts` + update `workspace-graph.ts`
2. Create `ipc-filesystem.ts`, `ipc-workspace.ts`, `ipc-knowledge.ts`, `ipc-canvas.ts`, `ipc-misc.ts`
3. Rewrite `ipc.ts` as thin registry
4. Run tests
