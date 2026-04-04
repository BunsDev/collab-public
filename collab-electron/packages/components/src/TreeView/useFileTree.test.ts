import { describe, test, expect } from "bun:test";
import { flattenTreeWithWorkspaces } from "./useFileTree";

describe("flattenTreeWithWorkspaces", () => {
  test("produces workspace nodes at level 0", () => {
    const workspaces = [
      { path: "/home/user/notes", name: "notes" },
      { path: "/home/user/docs", name: "docs" },
    ];
    const trees = new Map([
      ["/home/user/docs", [{ name: "readme.md", path: "/home/user/docs/readme.md", kind: "file" as const }]],
      ["/home/user/notes", [{ name: "todo.md", path: "/home/user/notes/todo.md", kind: "file" as const }]],
    ]);
    const result = flattenTreeWithWorkspaces(workspaces, trees, new Set(), "alpha-asc");
    // Workspaces sorted alphabetically: docs before notes
    expect(result[0].kind).toBe("workspace");
    expect(result[0].name).toBe("docs");
    expect(result[0].level).toBe(0);
    expect(result[1].kind).toBe("workspace");
    expect(result[1].name).toBe("notes");
    expect(result[1].level).toBe(0);
  });

  test("children at level 1 when workspace expanded", () => {
    const workspaces = [{ path: "/home/user/docs", name: "docs" }];
    const trees = new Map([
      ["/home/user/docs", [{ name: "readme.md", path: "/home/user/docs/readme.md", kind: "file" as const }]],
    ]);
    const expanded = new Set(["/home/user/docs"]);
    const result = flattenTreeWithWorkspaces(workspaces, trees, expanded, "alpha-asc");
    expect(result[0].kind).toBe("workspace");
    expect(result[1].kind).toBe("file");
    expect(result[1].level).toBe(1);
    expect(result[1].workspacePath).toBe("/home/user/docs");
  });

  test("collapsed workspace shows no children", () => {
    const workspaces = [{ path: "/home/user/docs", name: "docs" }];
    const trees = new Map([
      ["/home/user/docs", [{ name: "readme.md", path: "/home/user/docs/readme.md", kind: "file" as const }]],
    ]);
    const result = flattenTreeWithWorkspaces(workspaces, trees, new Set(), "alpha-asc");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("workspace");
  });

  test("nested folder children offset by workspace level", () => {
    const workspaces = [{ path: "/ws", name: "ws" }];
    const trees = new Map([
      ["/ws", [{
        name: "src",
        path: "/ws/src",
        kind: "folder" as const,
        children: [
          { name: "index.ts", path: "/ws/src/index.ts", kind: "file" as const },
        ],
      }]],
    ]);
    const expandedDirs = new Set(["/ws/src"]);
    const expandedWs = new Set(["/ws"]);
    const result = flattenTreeWithWorkspaces(workspaces, trees, expandedWs, "alpha-asc", expandedDirs);
    // workspace at 0, folder at 1, file at 2
    expect(result[0].level).toBe(0);
    expect(result[0].kind).toBe("workspace");
    expect(result[1].level).toBe(1);
    expect(result[1].kind).toBe("folder");
    expect(result[2].level).toBe(2);
    expect(result[2].kind).toBe("file");
    expect(result[2].workspacePath).toBe("/ws");
  });

  test("empty workspace tree produces only workspace node", () => {
    const workspaces = [{ path: "/empty", name: "empty" }];
    const trees = new Map<string, { name: string; path: string; kind: "file" | "folder" }[]>();
    const expanded = new Set(["/empty"]);
    const result = flattenTreeWithWorkspaces(workspaces, trees, expanded, "alpha-asc");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("workspace");
  });
});
