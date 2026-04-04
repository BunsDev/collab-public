import {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import type { TreeNode } from '@collab/shared/types';
import {
	isSubpath,
	joinPath,
	parentPath,
	splitPathSegments,
} from '@collab/shared/path-utils';
import type { SortMode } from './types';

export interface FlatItem {
	id: string;
	kind: 'folder' | 'file' | 'workspace';
	level: number;
	name: string;
	path: string;
	isExpanded?: boolean;
	ctime?: string;
	mtime?: string;
	childCount?: number;
	workspacePath?: string;
}

function loadExpandedState(): Set<string> {
	return new Set<string>();
}

function saveExpandedDirs(
	expanded: Set<string>,
	workspacePath?: string,
) {
	if (!workspacePath) return;
	window.api.setWorkspacePref(
		'expanded_dirs',
		[...expanded],
		workspacePath,
	);
}

function saveExpandedWorkspaces(
	expanded: Set<string>,
) {
	window.api.setPref(
		'expanded_workspaces',
		[...expanded],
	);
}

function sortFiles(
	files: TreeNode[],
	sortMode: SortMode,
): TreeNode[] {
	if (sortMode.startsWith('alpha')) {
		const isDesc = sortMode === 'alpha-desc';
		return [...files].sort((a, b) => {
			const cmp = a.name.localeCompare(b.name);
			return isDesc ? -cmp : cmp;
		});
	}

	const useModified = sortMode.startsWith('modified');
	const isDesc = sortMode.endsWith('desc');

	return [...files].sort((a, b) => {
		const getTs = (n: TreeNode) => {
			const raw = useModified ? n.mtime : n.ctime;
			if (!raw) return 0;
			return new Date(raw).getTime();
		};
		const ta = getTs(a);
		const tb = getTs(b);
		return isDesc ? tb - ta : ta - tb;
	});
}

function flattenTree(
	nodes: TreeNode[],
	expanded: Set<string>,
	level: number,
	sortMode: SortMode,
	levelOffset = 0,
): FlatItem[] {
	const effectiveLevel = level + levelOffset;
	const items: FlatItem[] = [];
	const dirs = nodes.filter(
		(n) => n.kind === 'folder',
	);
	const files = nodes.filter(
		(n) => n.kind === 'file',
	);

	for (const dir of dirs) {
		const isOpen = expanded.has(dir.path);
		items.push({
			id: dir.path,
			kind: 'folder',
			level: effectiveLevel,
			name: dir.name,
			path: dir.path,
			isExpanded: isOpen,
			childCount: countFilesInNode(dir),
		});
		if (
			isOpen &&
			(dir.children ?? []).length > 0
		) {
			items.push(
				...flattenTree(
					dir.children ?? [],
					expanded,
					level + 1,
					sortMode,
					levelOffset,
				),
			);
		}
	}

	const sorted = sortFiles(files, sortMode);
	for (const file of sorted) {
		items.push({
			id: file.path,
			kind: 'file',
			level: effectiveLevel,
			name: file.name,
			path: file.path,
			ctime: file.ctime,
			mtime: file.mtime,
		});
	}

	return items;
}

export function flattenTreeWithWorkspaces(
	workspaces: { path: string; name: string }[],
	trees: Map<string, TreeNode[]>,
	expandedWorkspaces: Set<string>,
	sortMode: SortMode,
	expandedDirs: Set<string> = new Set(),
): FlatItem[] {
	const sorted = [...workspaces].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const result: FlatItem[] = [];
	for (const ws of sorted) {
		const isOpen = expandedWorkspaces.has(ws.path);
		result.push({
			id: `ws:${ws.path}`,
			kind: 'workspace',
			level: 0,
			name: ws.name,
			path: ws.path,
			isExpanded: isOpen,
		});
		if (isOpen) {
			const tree = trees.get(ws.path) ?? [];
			const flat = flattenTree(
				tree,
				expandedDirs,
				0,
				sortMode,
				1,
			);
			for (const item of flat) {
				result.push({
					...item,
					workspacePath: ws.path,
				});
			}
		}
	}
	return result;
}

function findWorkspaceRoot(
	dirPath: string,
	workspaces: { path: string }[],
): string | undefined {
	return workspaces.find(
		(ws) =>
			dirPath === ws.path ||
			isSubpath(ws.path, dirPath),
	)?.path;
}

export function useFileTree(
	workspaces: { path: string; name: string }[],
	sortMode: SortMode,
) {
	const [dirContents, setDirContents] = useState<
		Map<string, TreeNode[]>
	>(new Map());
	const [expandedDirs, setExpandedDirs] = useState<
		Set<string>
	>(loadExpandedState);
	const [expandedWorkspaces, setExpandedWorkspaces] =
		useState<Set<string>>(loadExpandedState);
	const dirContentsRef = useRef(dirContents);
	dirContentsRef.current = dirContents;
	const pendingLoadsRef = useRef(
		new Map<string, Promise<TreeNode[]>>(),
	);
	const dirtyDirsRef = useRef(new Set<string>());
	const workspacesRef = useRef(workspaces);
	workspacesRef.current = workspaces;

	useEffect(() => {
		window.api
			.getPref('expanded_workspaces')
			.then(async (stored) => {
				const openPaths =
					Array.isArray(stored) &&
					stored.length > 0
						? (stored as string[])
						: workspaces.map(
								(ws) => ws.path,
							);
				setExpandedWorkspaces(
					new Set(openPaths),
				);

				const allDirs: string[] = [];
				await Promise.all(
					openPaths.map(async (wsPath) => {
						const dirs =
							await window.api.getWorkspacePref(
								'expanded_dirs',
								wsPath,
							);
						if (Array.isArray(dirs)) {
							allDirs.push(
								...(dirs as string[]),
							);
						}
					}),
				);
				if (allDirs.length > 0) {
					setExpandedDirs(
						new Set(allDirs),
					);
				}
			})
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount
	}, []);

	const workspacesKey = workspaces
		.map((ws) => ws.path)
		.join('\0');
	const prevWorkspacesKeyRef = useRef(workspacesKey);

	const loadDir = useCallback(
		async (dirPath: string) => {
			const pending =
				pendingLoadsRef.current.get(dirPath);
			if (pending) {
				dirtyDirsRef.current.add(dirPath);
				return pending;
			}

			const request = (async () => {
			try {
				const entries =
					await window.api.readDir(dirPath);
				const children: TreeNode[] = entries
					.map(
						(e: {
							name: string;
							isDirectory: boolean;
							createdAt: string;
							modifiedAt: string;
							fileCount?: number;
						}): TreeNode => {
							const node: TreeNode = {
								name: e.name,
								path: joinPath(
									dirPath,
									e.name,
								),
								kind: e.isDirectory
									? 'folder'
									: 'file',
								ctime: e.createdAt,
								mtime: e.modifiedAt,
							};

							if (
								e.fileCount !==
								undefined
							) {
								node.fileCount =
									e.fileCount;
							}

							return node;
						},
					)
					.sort(
						(
							a: TreeNode,
							b: TreeNode,
						) => {
							const aIsDir =
								a.kind === 'folder';
							const bIsDir =
								b.kind === 'folder';
							if (aIsDir !== bIsDir)
								return aIsDir ? -1 : 1;
							if (aIsDir)
								return a.name.localeCompare(
									b.name,
								);
							return 0;
						},
					);

				setDirContents((prev) => {
					const existing =
						prev.get(dirPath);
					if (
						existing &&
						treesEqual(existing, children)
					) {
						return prev;
					}
					const next = new Map(prev);
					next.set(dirPath, children);
					return next;
				});

				return children;
			} catch (err) {
				console.error(
					`Failed to load dir ${dirPath}:`,
					err,
				);
				setDirContents((prev) => {
					if (prev.has(dirPath)) return prev;
					const next = new Map(prev);
					next.set(dirPath, []);
					return next;
				});
				return [];
			} finally {
				pendingLoadsRef.current.delete(
					dirPath,
				);
				if (
					dirtyDirsRef.current.delete(dirPath)
				) {
					queueMicrotask(() =>
						loadDir(dirPath),
					);
				}
			}
			})();

			pendingLoadsRef.current.set(
				dirPath,
				request,
			);
			return request;
		},
		[],
	);

	useEffect(() => {
		return window.api.onFsChanged((events) => {
			const affectedDirs = new Set(
				events.map((e) => e.dirPath),
			);
			const toReload = new Set<string>();
			for (const dirPath of affectedDirs) {
				if (
					dirContentsRef.current.has(
						dirPath,
					) ||
					pendingLoadsRef.current.has(dirPath)
				) {
					toReload.add(dirPath);
				} else {
					let parent = dirPath;
					while (true) {
						const nextParent =
							parentPath(parent);
						if (nextParent === parent)
							break;
						parent = nextParent;
						if (
							dirContentsRef.current.has(
								parent,
							)
						) {
							toReload.add(parent);
							break;
						}
					}
				}
			}
			for (const dirPath of toReload) {
				loadDir(dirPath);
			}
		});
	}, [loadDir]);

	useEffect(() => {
		return window.api.onFileRenamed(() => {
			for (const dirPath of dirContentsRef.current.keys()) {
				loadDir(dirPath);
			}
		});
	}, [loadDir]);

	useEffect(() => {
		const changed =
			workspacesKey !==
			prevWorkspacesKeyRef.current;
		prevWorkspacesKeyRef.current = workspacesKey;

		if (changed) {
			const roots = new Set(
				workspaces.map((ws) => ws.path),
			);
			setDirContents((prev) => {
				const next = new Map<
					string,
					TreeNode[]
				>();
				for (const [k, v] of prev) {
					for (const root of roots) {
						if (isSubpath(root, k)) {
							next.set(k, v);
						}
					}
				}
				return next;
			});

			setExpandedWorkspaces((prev) => {
				const valid = new Set<string>();
				for (const p of prev) {
					if (roots.has(p)) valid.add(p);
				}
				if (valid.size === 0) return roots;
				return valid;
			});
		}

		for (const ws of workspaces) {
			loadDir(ws.path);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- workspaces is represented by workspacesKey
	}, [workspacesKey, loadDir]);

	useEffect(() => {
		for (const dirPath of expandedDirs) {
			if (!dirContents.has(dirPath)) {
				loadDir(dirPath);
			}
		}
	}, [expandedDirs, dirContents, loadDir]);

	const perWorkspaceTrees = useMemo(() => {
		const trees = new Map<string, TreeNode[]>();
		for (const ws of workspaces) {
			const children =
				dirContents.get(ws.path) ?? [];
			const hydrated = children.map((child) =>
				hydrateNode(child, dirContents),
			);
			trees.set(ws.path, hydrated);
		}
		return trees;
	}, [workspaces, dirContents]);

	const flatItems = useMemo(
		() =>
			flattenTreeWithWorkspaces(
				workspaces,
				perWorkspaceTrees,
				expandedWorkspaces,
				sortMode,
				expandedDirs,
			),
		[
			workspaces,
			perWorkspaceTrees,
			expandedWorkspaces,
			sortMode,
			expandedDirs,
		],
	);

	const expandRecursive = useCallback(
		async (rootPath: string) => {
			const toExpand: string[] = [];

			async function collect(path: string) {
				toExpand.push(path);
				const cached =
					dirContentsRef.current.get(path);
				const children =
					cached ?? (await loadDir(path));
				const subs = children.filter(
					(n) => n.kind === 'folder',
				);
				await Promise.all(
					subs.map((s) => collect(s.path)),
				);
			}

			await collect(rootPath);

			const wsRoot = findWorkspaceRoot(
				rootPath,
				workspacesRef.current,
			);
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				for (const p of toExpand) next.add(p);
				saveExpandedDirs(next, wsRoot);
				return next;
			});
		},
		[loadDir],
	);

	const toggleExpand = useCallback(
		(
			path: string,
			recursive = false,
			kind?: 'workspace' | 'folder',
		) => {
			if (kind === 'workspace') {
				const wasCollapsed =
					!expandedWorkspaces.has(path);
				setExpandedWorkspaces((prev) => {
					const next = new Set(prev);
					if (next.has(path)) {
						next.delete(path);
					} else {
						next.add(path);
					}
					saveExpandedWorkspaces(next);
					return next;
				});
				if (wasCollapsed) {
					if (!dirContents.has(path)) {
						loadDir(path);
					}
					window.api
						.getWorkspacePref(
							'expanded_dirs',
							path,
						)
						.then((dirs) => {
							if (Array.isArray(dirs)) {
								setExpandedDirs(
									(prev) => {
										const next =
											new Set(
												prev,
											);
										for (const d of dirs as string[]) {
											next.add(d);
										}
										return next;
									},
								);
							}
						})
						.catch(() => {});
				}
				return;
			}

			const isOpen = expandedDirs.has(path);
			const wsRoot = findWorkspaceRoot(
				path,
				workspacesRef.current,
			);

			if (isOpen) {
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					if (recursive) {
						for (const p of prev) {
							if (
								p === path ||
								isSubpath(path, p)
							) {
								next.delete(p);
							}
						}
					} else {
						next.delete(path);
					}
					saveExpandedDirs(next, wsRoot);
					return next;
				});
			} else if (recursive) {
				expandRecursive(path);
			} else {
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					next.add(path);
					saveExpandedDirs(next, wsRoot);
					return next;
				});
				if (!dirContents.has(path)) {
					loadDir(path);
				}
			}
		},
		[
			dirContents,
			loadDir,
			expandedDirs,
			expandedWorkspaces,
			expandRecursive,
		],
	);

	const expandFolder = useCallback(
		(path: string) => {
			if (expandedDirs.has(path)) return;
			const wsRoot = findWorkspaceRoot(
				path,
				workspacesRef.current,
			);
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				next.add(path);
				saveExpandedDirs(next, wsRoot);
				return next;
			});
			if (!dirContents.has(path)) {
				loadDir(path);
			}
		},
		[expandedDirs, dirContents, loadDir],
	);

	const expandAncestors = useCallback(
		(filePath: string) => {
			const roots = workspaces.map(
				(ws) => ws.path,
			);
			const root = roots.find((r) =>
				isSubpath(r, filePath),
			);
			if (!root) return;

			const relative = filePath.slice(
				root.length + 1,
			);
			const parts = splitPathSegments(relative);
			parts.pop();

			const dirsToExpand: string[] = [];
			let current = root;
			for (const part of parts) {
				current = joinPath(current, part);
				dirsToExpand.push(current);
			}

			setExpandedWorkspaces((prev) => {
				if (prev.has(root)) return prev;
				const next = new Set(prev);
				next.add(root);
				saveExpandedWorkspaces(next);
				return next;
			});

			setExpandedDirs((prev) => {
				if (
					dirsToExpand.every((p) =>
						prev.has(p),
					)
				)
					return prev;
				const next = new Set(prev);
				for (const p of dirsToExpand)
					next.add(p);
				saveExpandedDirs(next, root);
				return next;
			});

			for (const p of dirsToExpand) {
				if (!dirContentsRef.current.has(p)) {
					loadDir(p);
				}
			}
		},
		[workspaces, loadDir],
	);

	return {
		flatItems,
		expandedDirs,
		expandedWorkspaces,
		toggleExpand,
		expandFolder,
		expandAncestors,
	};
}

function hydrateNode(
	node: TreeNode,
	dirContents: Map<string, TreeNode[]>,
): TreeNode {
	if (node.kind !== 'folder') return node;

	const children = dirContents.get(node.path);
	if (!children) return node;

	const hydratedChildren = children.map((child) =>
		hydrateNode(child, dirContents),
	);
	return {
		...node,
		children: hydratedChildren,
	};
}

function treesEqual(
	left: TreeNode[],
	right: TreeNode[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}

	for (let i = 0; i < left.length; i++) {
		const a = left[i]!;
		const b = right[i]!;
		if (
			a.path !== b.path ||
			a.name !== b.name ||
			a.kind !== b.kind ||
			a.ctime !== b.ctime ||
			a.mtime !== b.mtime ||
			a.fileCount !== b.fileCount
		) {
			return false;
		}
	}

	return true;
}

function countFilesInTree(
	nodes: TreeNode[],
): number {
	let count = 0;
	for (const node of nodes) {
		count += countFilesInNode(node);
	}
	return count;
}

function countFilesInNode(node: TreeNode): number {
	if (node.kind === 'file') {
		return 1;
	}

	if (node.children === undefined) {
		return node.fileCount ?? 0;
	}

	return countFilesInTree(node.children);
}
