import { useCallback, useEffect, useState } from "react";
import "./App.css";

type TileType = "term" | "note" | "code" | "image" | "graph" | "browser";

interface TileEntry {
  id: string;
  type: TileType;
  title: string;
  description: string;
  status: "running" | "exited" | "idle" | null;
}

function isTileEntry(value: unknown): value is TileEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    typeof e.title === "string" &&
    typeof e.description === "string"
  );
}

const TYPE_ICONS: Record<TileType, string> = {
  term: "\u25A1",
  browser: "\uD83C\uDF10",
  graph: "\uD83D\uDCC8",
  note: "\uD83D\uDCC4",
  code: "\uD83D\uDCC4",
  image: "\uD83D\uDDBC\uFE0F",
};

function StatusBadge({ status }: { status: TileEntry["status"] }) {
  if (!status || status === "idle") return null;
  const cls = status === "running" ? "badge-running" : "badge-exited";
  return <div className={`status-badge ${cls}`} />;
}

function TileEntryRow({
  entry,
  focused,
  onClick,
  onDoubleClick,
}: {
  entry: TileEntry;
  focused: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className={`tile-entry${focused ? " focused" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="tile-icon">
        <span className="type-icon">{TYPE_ICONS[entry.type] || "\u25A1"}</span>
        <StatusBadge status={entry.status} />
      </div>
      <div className="tile-info">
        <div className="tile-title">{entry.title}</div>
        <div className="tile-desc">{entry.description}</div>
      </div>
    </div>
  );
}

function App() {
  const [entries, setEntries] = useState<TileEntry[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    const cleanup = window.api.onTileListMessage(
      (channel: string, ...args: unknown[]) => {
        if (channel === "tile-list:init") {
          const tiles = Array.isArray(args[0])
            ? args[0].filter(isTileEntry)
            : [];
          setEntries(tiles);
        } else if (channel === "tile-list:add") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) => [
            ...prev.filter((e) => e.id !== tile.id),
            tile,
          ]);
        } else if (channel === "tile-list:remove") {
          const id = args[0] as string;
          setEntries((prev) => prev.filter((e) => e.id !== id));
        } else if (channel === "tile-list:update") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) =>
            prev.map((e) => (e.id === tile.id ? tile : e)),
          );
        } else if (channel === "tile-list:focus") {
          setFocusedId(args[0] as string | null);
        }
      },
    );

    return () => {
      cleanup();
    };
  }, []);

  const handleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:peek-tile", id);
  }, []);

  const handleDoubleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:focus-tile", id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (entries.length === 0) return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const currentIdx = entries.findIndex((entry) => entry.id === focusedId);
      const nextIdx =
        currentIdx < 0
          ? 0
          : (currentIdx + dir + entries.length) % entries.length;
      handleClick(entries[nextIdx].id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [entries, focusedId, handleClick]);

  return (
    <div className="tile-list">
      {entries.map((entry) => (
        <TileEntryRow
          key={entry.id}
          entry={entry}
          focused={entry.id === focusedId}
          onClick={() => handleClick(entry.id)}
          onDoubleClick={() => handleDoubleClick(entry.id)}
        />
      ))}
      {entries.length === 0 && (
        <div className="tile-empty">
          No tiles on canvas
        </div>
      )}
    </div>
  );
}

export default App;
