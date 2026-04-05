import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	CaretRight,
	CaretDown,
	Terminal,
	Plus,
	Graph,
} from '@phosphor-icons/react';
import type { FlatItem } from './useFileTree';
import type { TreeNode } from '@collab/shared/types';
import {
	formatRelativeTime,
	displayFileName,
} from './Helpers';
import {
	splitDisplayPath,
} from '@collab/shared/path-utils';
import type { SortMode } from './types';
import { SearchSortControls } from './SearchSortControls';
import type { SearchSortControlsHandle } from './SearchSortControls';
import { getFileIcon } from './fileIcons';
import { useImageThumbnail } from './useImageThumbnail';

const ICON_SIZE = 14;
export const ENABLE_GRAPH_TILES = false;

function flattenAllFiles(
	nodes: TreeNode[],
	workspacePath: string,
): FlatItem[] {
	const items: FlatItem[] = [];
	const prefix = workspacePath.length + 1;
	function walk(children: TreeNode[]) {
		for (const node of children) {
			if (node.kind === 'file') {
				items.push({
					id: node.path,
					kind: 'file',
					level: 1,
					name: node.path.slice(prefix),
					path: node.path,
					ctime: node.ctime,
					mtime: node.mtime,
					workspacePath,
				});
			}
			if (node.children) {
				walk(node.children);
			}
		}
	}
	walk(nodes);
	return items;
}

interface FolderRowProps {
	item: FlatItem;
	onToggle: (
		path: string,
		recursive: boolean,
	) => void;
	onCreateFile: (
		folderPath: string,
		name: string,
	) => void;
	onPlusClick?: (folderPath: string) => void;
	rowHeight: number;
	isRenaming: boolean;
	renameValue: string;
	renameInputRef: React.RefObject<HTMLInputElement | null>;
	onRenameChange: (value: string) => void;
	onRenameConfirm: () => void;
	onRenameCancel: () => void;
	onContextMenu?: (
		e: React.MouseEvent,
		item: FlatItem | null,
	) => void;
	isDropTarget: boolean;
	onDragStart?: (
		e: React.DragEvent,
		path: string,
	) => void;
	onDragOver?: (
		e: React.DragEvent,
		folderPath: string,
	) => void;
	onDragLeave?: () => void;
	onDrop?: (
		e: React.DragEvent,
		targetFolder: string,
	) => void;
	onDragEnd?: () => void;
	onSelectFolder?: (path: string) => void;
	isWorkspace?: boolean;
	isFirstWorkspace?: boolean;
	dimmed?: boolean;
}

const FolderRow = React.memo(function FolderRow({
	item,
	onToggle,
	onCreateFile,
	onPlusClick,
	rowHeight,
	isRenaming,
	renameValue,
	renameInputRef,
	onRenameChange,
	onRenameConfirm,
	onContextMenu,
	onRenameCancel,
	isDropTarget,
	onDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	onDragEnd,
	onSelectFolder,
	isWorkspace = false,
	isFirstWorkspace = false,
	dimmed = false,
}: FolderRowProps) {
	const style: React.CSSProperties = isWorkspace
		? {
			paddingLeft: '0px',
			borderTop: isFirstWorkspace
				? 'none'
				: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)',
		}
		: {
			paddingLeft: `${item.level * 14}px`,
		};

	const className = `collection-tree-row collection-folder-row${isDropTarget ? ' drop-target' : ''}${isWorkspace ? ' workspace-folder-row' : ''}${dimmed ? ' dimmed' : ''}`;

	return (
		<div
			className={className}
			style={style}
			draggable={!isWorkspace}
			onDragStart={isWorkspace ? undefined : (e) =>
				onDragStart?.(e, item.path)
			}
			onDragOver={(e) =>
				onDragOver?.(e, item.path)
			}
			onDragLeave={onDragLeave}
			onDrop={(e) =>
				onDrop?.(e, item.path)
			}
			onDragEnd={onDragEnd}
			onClick={(e) =>
				onToggle(item.path, e.altKey)
			}
			onContextMenu={(e) => {
				e.preventDefault();
				onContextMenu?.(e, item);
			}}
		>
			<span className="collection-tree-caret">
				{item.isExpanded ? (
					<CaretDown
						size={10}
						weight="bold"
					/>
				) : (
					<CaretRight
						size={10}
						weight="bold"
					/>
				)}
			</span>
			{isRenaming && !isWorkspace ? (
				<input
					ref={renameInputRef}
					className="inline-rename-input"
					value={renameValue}
					onChange={(e) =>
						onRenameChange(e.target.value)
					}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							onRenameConfirm();
						} else if (
							e.key === 'Escape'
						) {
							e.preventDefault();
							onRenameCancel();
						}
					}}
					onBlur={onRenameConfirm}
					onClick={(e) =>
						e.stopPropagation()
					}
				/>
			) : isWorkspace ? (
				<div className="workspace-label">
					<span className="workspace-parent">
						{splitDisplayPath(item.path).parent}
					</span>
					<span className="workspace-name">
						{item.name}
					</span>
				</div>
			) : (
				<span className="collection-tree-name">
					{item.name}
				</span>
			)}
			{item.childCount != null && (
				<span className="collection-tree-count">
					{item.childCount}
				</span>
			)}
			<button
				className="folder-action-button"
				title="Add to folder"
				onClick={(e) => {
					e.stopPropagation();
					if (onPlusClick) {
						onPlusClick(item.path);
					} else {
						onCreateFile(item.path, '');
					}
				}}
			>
				<Plus size={12} weight="bold" />
			</button>
			<button
				className="folder-action-button"
				title="Open in Terminal"
				onClick={(e) => {
					e.stopPropagation();
					window.api.openInTerminal(
						item.path,
					);
				}}
			>
				<Terminal size={12} weight="bold" />
			</button>
			{ENABLE_GRAPH_TILES && (
				<button
					className="folder-action-button"
					title="Open graph view"
					onClick={(e) => {
						e.stopPropagation();
						if (typeof window.api.createGraphTile === "function") {
							window.api.createGraphTile(item.path);
						}
					}}
				>
					<Graph size={12} weight="bold" />
				</button>
			)}
		</div>
	);
});

export interface FileRowProps {
	item: FlatItem;
	isSelected: boolean;
	isMultiSelected?: boolean;
	isDeleteConfirm?: boolean;
	onItemClick: (
		path: string,
		e: { metaKey: boolean; shiftKey: boolean },
	) => void;
	onDelete?: (
		e: React.MouseEvent,
		path: string,
	) => void;
	onDeleteCancel?: () => void;
	isRenaming?: boolean;
	renameValue?: string;
	renameInputRef?: React.RefObject<HTMLInputElement | null>;
	onRenameChange?: (value: string) => void;
	onRenameConfirm?: () => void;
	onRenameCancel?: () => void;
	onContextMenu?: (
		e: React.MouseEvent,
		item: FlatItem | null,
	) => void;
	onDragStart?: (
		e: React.DragEvent,
		path: string,
	) => void;
	onDragEnd?: () => void;
	sortMode?: SortMode;
}

export const FileRow = React.memo(
	function FileRow({
		item,
		isSelected,
		isMultiSelected = false,
		isDeleteConfirm = false,
		onItemClick,
		onDelete,
		onDeleteCancel,
		isRenaming = false,
		renameValue = '',
		renameInputRef,
		onRenameChange,
		onRenameConfirm,
		onContextMenu,
		onRenameCancel,
		onDragStart,
		onDragEnd,
		sortMode,
	}: FileRowProps) {
		const slash = item.name.lastIndexOf('/');
		const isSearchResult = slash >= 0;
		const fileName = isSearchResult
			? item.name.slice(slash + 1)
			: item.name;
		const parentDir = isSearchResult
			? item.name.slice(0, slash + 1)
			: '';
		const { stem, ext } = displayFileName(fileName);
		const thumbnailUrl = useImageThumbnail(item.path, ICON_SIZE * 4);
		const showTimestamp = !sortMode?.startsWith('alpha');

		return (
			<div
				data-item-id={item.path}
				className={`collection-tree-row collection-item-row${isSelected ? ' isFocused' : ''}${isMultiSelected ? ' isMultiSelected' : ''}`}
				style={{
					paddingLeft: `${item.level * 14}px`,
				}}
				draggable
				onDragStart={(e) =>
					onDragStart?.(e, item.path)
				}
				onDragEnd={onDragEnd}
				onClick={(e) =>
					onItemClick(item.path, {
						metaKey: e.metaKey,
						shiftKey: e.shiftKey,
					})
				}
				onContextMenu={(e) => {
					e.preventDefault();
					onContextMenu?.(e, item);
				}}
				onMouseLeave={() => {
					if (isDeleteConfirm)
						onDeleteCancel?.();
				}}
			>
				<span className="item-icon">
					{thumbnailUrl ? (
						<img
							src={thumbnailUrl}
							width={ICON_SIZE}
							height={ICON_SIZE}
							style={{
								borderRadius: 2,
								objectFit: "cover",
							}}
							alt=""
						/>
					) : (() => {
						const { icon: IconComp, color } = getFileIcon(fileName);
						return (
							<IconComp
								size={ICON_SIZE}
								weight="regular"
								style={{ color }}
							/>
						);
					})()}
				</span>
				{isRenaming ? (
					<input
						ref={renameInputRef}
						className="inline-rename-input"
						value={renameValue}
						onChange={(e) =>
							onRenameChange(e.target.value)
						}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								onRenameConfirm();
							} else if (e.key === 'Escape') {
								e.preventDefault();
								onRenameCancel();
							}
						}}
						onBlur={onRenameConfirm}
						onClick={(e) => e.stopPropagation()}
					/>
				) : isSearchResult ? (
					<div className="search-result-label">
						<span className="search-result-parent">
							{parentDir}
						</span>
						<span className="search-result-name">
							{stem}
							{ext && (
								<span style={{ opacity: 0.4 }}>
									{ext}
								</span>
							)}
						</span>
					</div>
				) : (
					<span className="item-text">
						{stem}
						{ext && (
							<span style={{ opacity: 0.4 }}>
								{ext}
							</span>
						)}
					</span>
				)}
				<div className="row-action-buttons">
					{showTimestamp && (
						<span className="row-timestamp">
							{formatRelativeTime(item.ctime)}
						</span>
					)}
				</div>
			</div>
		);
	},
	(prev, next) =>
		prev.item.id === next.item.id &&
		prev.item.name === next.item.name &&
		prev.item.ctime === next.item.ctime &&
		prev.isSelected === next.isSelected &&
		prev.isMultiSelected ===
			next.isMultiSelected &&
		prev.isDeleteConfirm ===
			next.isDeleteConfirm &&
		prev.item.level === next.item.level &&
		prev.onItemClick === next.onItemClick &&
		prev.onDelete === next.onDelete &&
		prev.isRenaming === next.isRenaming &&
		prev.renameValue === next.renameValue &&
		prev.onContextMenu === next.onContextMenu &&
		prev.onDragStart === next.onDragStart &&
		prev.onDragEnd === next.onDragEnd &&
		prev.sortMode === next.sortMode,
);

interface TreeViewProps {
	flatItems: FlatItem[];
	selectedPath: string | null;
	selectedPaths: Set<string>;
	onItemClick: (
		path: string,
		e: { metaKey: boolean; shiftKey: boolean },
	) => void;
	onToggleFolder: (
		path: string,
		recursive: boolean,
	) => void;
	onCreateFile: (
		folderPath: string,
		name: string,
	) => void;
	onPlusClick?: (folderPath: string) => void;
	onContextMenu?: (
		e: React.MouseEvent,
		item: FlatItem | null,
	) => void;
	onDeleteFile?: (path: string) => void;
	onDeleteFiles?: (paths: string[]) => void;
	sortMode: SortMode;
	onCycleSortMode: () => void;
	leadingContent?: React.ReactNode;
	renamingPath?: string | null;
	renameValue?: string;
	renameInputRef?: React.RefObject<HTMLInputElement | null>;
	onRenameChange?: (value: string) => void;
	onRenameConfirm?: () => void;
	onRenameCancel?: () => void;
	dropTargetPath?: string | null;
	onDragStart?: (
		e: React.DragEvent,
		path: string,
	) => void;
	onDragOver?: (
		e: React.DragEvent,
		folderPath: string,
	) => void;
	onDragLeave?: () => void;
	onDrop?: (
		e: React.DragEvent,
		targetFolder: string,
	) => void;
	onDragEnd?: () => void;
	workspacePath?: string;
	workspaces?: { path: string; name: string }[];
	cursorPath?: string | null;
	onSelectFolder?: (path: string) => void;
	isActive?: boolean;
	searchRef?: React.RefObject<SearchSortControlsHandle | null>;
	headerActions?: React.ReactNode;
}

export const TreeView: React.FC<
	TreeViewProps
> = ({
	flatItems,
	selectedPath,
	selectedPaths,
	onItemClick,
	onToggleFolder,
	onCreateFile,
	onPlusClick,
	onContextMenu,
	onDeleteFile,
	sortMode,
	onCycleSortMode,
	leadingContent,
	renamingPath,
	renameValue,
	renameInputRef,
	onRenameChange,
	onRenameConfirm,
	onRenameCancel,
	dropTargetPath,
	onDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	onDragEnd,
	workspacePath,
	workspaces,
	cursorPath,
	onSelectFolder,
	isActive = true,
	searchRef,
	headerActions,
}) => {
	const [searchQuery, setSearchQuery] = useState('');
	const [deleteConfirmId, setDeleteConfirmId] =
		useState<string | null>(null);
	const [allFiles, setAllFiles] = useState<FlatItem[] | null>(null);
	const isSearching = searchQuery.trim().length > 0;

	const workspacesKey =
		workspaces?.map((ws) => ws.path).join('\0') ?? '';

	useEffect(() => {
		setAllFiles(null);
	}, [workspacesKey]);

	useEffect(() => {
		if (!isSearching || !workspaces?.length) {
			setAllFiles(null);
			return;
		}
		if (allFiles) return;
		let cancelled = false;
		Promise.all(
			workspaces.map(async (ws) => {
				const tree: TreeNode[] =
					await window.api.readTree({
						root: ws.path,
					});
				return {
					ws,
					files: flattenAllFiles(
						tree,
						ws.path,
					),
				};
			}),
		).then((results) => {
			if (cancelled) return;
			const items: FlatItem[] = [];
			for (const { ws, files } of results) {
				items.push({
					id: `ws:${ws.path}`,
					kind: 'workspace',
					level: 0,
					name: ws.name,
					path: ws.path,
					isExpanded: true,
				});
				items.push(...files);
			}
			setAllFiles(items);
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- workspaces tracked via workspacesKey
	}, [isSearching, workspacesKey, allFiles]);

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return flatItems;
		const query = searchQuery.toLowerCase();

		if (allFiles) {
			// Flat search: workspace headers + matching files
			const result: FlatItem[] = [];
			let currentWs: FlatItem | null = null;
			const pending: FlatItem[] = [];

			for (const item of allFiles) {
				if (item.kind === 'workspace') {
					if (currentWs) {
						result.push(
							currentWs,
							...pending,
						);
					}
					currentWs = item;
					pending.length = 0;
				} else if (item.kind === 'file') {
					const slash =
						item.name.lastIndexOf('/');
					const fileName =
						slash >= 0
							? item.name.slice(
									slash + 1,
								)
							: item.name;
					if (
						fileName
							.toLowerCase()
							.includes(query)
					) {
						pending.push(item);
					}
				}
			}
			if (currentWs) {
				result.push(currentWs, ...pending);
			}
			return result;
		}

		// Fallback while full tree loads: filter visible items
		return flatItems.filter((item) => {
			if (item.kind === 'workspace') return true;
			if (item.kind === 'folder') return true;
			return item.name
				.toLowerCase()
				.includes(query);
		});
	}, [flatItems, allFiles, searchQuery]);

	const dimmedWorkspaces = useMemo(
		() => new Set<string>(),
		[],
	);

	const deleteConfirmRef = useRef(deleteConfirmId);
	deleteConfirmRef.current = deleteConfirmId;

	const handleDelete = useCallback(
		(
			e: React.MouseEvent,
			filePath: string,
		) => {
			e.preventDefault();
			e.stopPropagation();
			if (
				deleteConfirmRef.current === filePath
			) {
				onDeleteFile?.(filePath);
				setDeleteConfirmId(null);
			} else {
				setDeleteConfirmId(filePath);
			}
		},
		[onDeleteFile],
	);

	const handleDeleteCancel = useCallback(() => {
		setDeleteConfirmId(null);
	}, []);

	const containerRef =
		useRef<HTMLDivElement>(null);
	const [folderRowHeight, setFolderRowHeight] =
		useState(0);

	useLayoutEffect(() => {
		if (
			folderRowHeight > 0 ||
			!containerRef.current
		)
			return;
		const el =
			containerRef.current.querySelector(
				'.collection-folder-row',
			);
		if (el) {
			setFolderRowHeight(
				el.getBoundingClientRect().height,
			);
		}
	}, [folderRowHeight, filteredItems]);

	useEffect(() => {
		if (!selectedPath || !containerRef.current)
			return;
		const el = containerRef.current.querySelector(
			`[data-item-id="${CSS.escape(selectedPath)}"]`,
		);
		if (!el) return;
		const container = containerRef.current;
		const elRect = el.getBoundingClientRect();
		const boxRect =
			container.getBoundingClientRect();
		const top = elRect.top - boxRect.top;
		const bottom = elRect.bottom - boxRect.top;

		if (top < 0) {
			container.scrollTop += top;
		} else if (bottom > container.clientHeight) {
			container.scrollTop +=
				bottom - container.clientHeight;
		}
	}, [selectedPath, filteredItems]);

	const lastSelectedIndexRef = useRef<number>(-1);

	const navigableItems = useMemo(
		() =>
			filteredItems.filter(
				(item) => item.kind === 'file',
			),
		[filteredItems],
	);

	useEffect(() => {
		const idx = navigableItems.findIndex(
			(d) => d.path === selectedPath,
		);
		if (idx >= 0)
			lastSelectedIndexRef.current = idx;
	}, [navigableItems, selectedPath]);

	const navigateItems = useCallback(
		(direction: 'up' | 'down', shiftKey: boolean) => {
			if (navigableItems.length === 0) return;

			const effectivePath =
				cursorPath ?? selectedPath;
			let currentIndex =
				navigableItems.findIndex(
					(d) => d.path === effectivePath,
				);

			if (
				currentIndex < 0 &&
				lastSelectedIndexRef.current >= 0
			) {
				currentIndex = Math.min(
					lastSelectedIndexRef.current,
					navigableItems.length - 1,
				);
			}

			let nextIndex: number;
			if (direction === 'down') {
				nextIndex =
					currentIndex < 0
						? 0
						: Math.min(
								currentIndex + 1,
								navigableItems.length -
									1,
							);
			} else {
				nextIndex =
					currentIndex < 0
						? 0
						: Math.max(
								currentIndex - 1,
								0,
							);
			}

			lastSelectedIndexRef.current = nextIndex;
			const next = navigableItems[nextIndex];
			if (!next) return;

			onItemClick(next.path, {
				metaKey: false,
				shiftKey,
			});

			const container = containerRef.current;
			const el = container?.querySelector(
				`[data-item-id="${CSS.escape(next.path)}"]`,
			);
			if (el && container) {
				const elRect =
					el.getBoundingClientRect();
				const boxRect =
					container.getBoundingClientRect();
				const stickyTop =
					next.level * folderRowHeight;
				const top =
					elRect.top - boxRect.top;
				const bottom =
					elRect.bottom - boxRect.top;

				if (top < stickyTop) {
					container.scrollTop +=
						top - stickyTop;
				} else if (
					bottom > container.clientHeight
				) {
					container.scrollTop +=
						bottom -
						container.clientHeight;
				}
			}
		},
		[
			navigableItems,
			selectedPath,
			cursorPath,
			onItemClick,
			folderRowHeight,
		],
	);

	useEffect(() => {
		if (!isActive) return;

		const handleKeyDown = (
			e: KeyboardEvent,
		) => {
			if (
				e.key !== 'ArrowUp' &&
				e.key !== 'ArrowDown'
			)
				return;

			const active = document.activeElement;
			if (
				active?.tagName === 'INPUT' ||
				active?.tagName === 'TEXTAREA'
			)
				return;

			e.preventDefault();
			navigateItems(
				e.key === 'ArrowDown' ? 'down' : 'up',
				e.shiftKey,
			);
		};

		window.addEventListener(
			'keydown',
			handleKeyDown,
		);
		return () =>
			window.removeEventListener(
				'keydown',
				handleKeyDown,
			);
	}, [isActive, navigateItems]);

	const renderItems = (
		start: number,
		minLevel: number,
	): [React.ReactNode[], number] => {
		const nodes: React.ReactNode[] = [];
		let i = start;

		let workspaceIndex = 0;
		while (i < filteredItems.length) {
			const item = filteredItems[i]!;
			if (item.level < minLevel) break;

			if (item.kind === 'workspace') {
				const isFirst = workspaceIndex === 0;
				const isDimmed = dimmedWorkspaces.has(
					item.path,
				);
				workspaceIndex++;
				i++;
				if (item.isExpanded) {
					const [children, nextI] =
						renderItems(
							i,
							item.level + 1,
						);
					nodes.push(
						<div
							key={item.id}
							className="workspace-group"
						>
							<FolderRow
								item={item}
								onToggle={onToggleFolder}
								onCreateFile={
									onCreateFile
								}
								onPlusClick={
									onPlusClick
								}
								rowHeight={
									folderRowHeight
								}
								isRenaming={false}
								renameValue=""
								renameInputRef={{
									current: null,
								}}
								onRenameChange={() => {}}
								onRenameConfirm={() => {}}
								onRenameCancel={() => {}}
								onContextMenu={
									onContextMenu
								}
								isDropTarget={
									dropTargetPath ===
									item.path
								}
								onDragOver={
									onDragOver
								}
								onDragLeave={
									onDragLeave
								}
								onDrop={onDrop}
								isWorkspace
								isFirstWorkspace={isFirst}
								dimmed={isDimmed}
							/>
							{children}
							{isSearching && children.length === 0 && (
								<div className="search-no-matches">
									No matching files
								</div>
							)}
						</div>,
					);
					i = nextI;
				} else {
					nodes.push(
						<FolderRow
							key={item.id}
							item={item}
							onToggle={onToggleFolder}
							onCreateFile={
								onCreateFile
							}
							onPlusClick={
								onPlusClick
							}
							rowHeight={
								folderRowHeight
							}
							isRenaming={false}
							renameValue=""
							renameInputRef={{
								current: null,
							}}
							onRenameChange={() => {}}
							onRenameConfirm={() => {}}
							onRenameCancel={() => {}}
							onContextMenu={
								onContextMenu
							}
							isDropTarget={
								dropTargetPath ===
								item.path
							}
							onDragOver={
								onDragOver
							}
							onDragLeave={
								onDragLeave
							}
							onDrop={onDrop}
							isWorkspace
							isFirstWorkspace={isFirst}
							dimmed={isDimmed}
						/>,
					);
				}
			} else if (
				item.kind === 'folder' &&
				item.isExpanded
			) {
				i++;
				const [children, nextI] = renderItems(
					i,
					item.level + 1,
				);
				const guideStyle = {
					'--guide-left': `${item.level * 14 + 6}px`,
					'--guide-top': `${folderRowHeight}px`,
					'--guide-z': 9 - item.level,
				} as React.CSSProperties;
				nodes.push(
					<div
						key={item.id}
						className="folder-group"
						style={guideStyle}
					>
						<FolderRow
							item={item}
							onToggle={onToggleFolder}
							onCreateFile={
								onCreateFile
							}
							onPlusClick={
								onPlusClick
							}
							rowHeight={
								folderRowHeight
							}
							isRenaming={
								renamingPath ===
								item.path
							}
							renameValue={
								renameValue ?? ''
							}
							renameInputRef={
								renameInputRef ?? {
									current: null,
								}
							}
							onRenameChange={
								onRenameChange ??
								(() => {})
							}
							onRenameConfirm={
								onRenameConfirm ??
								(() => {})
							}
							onRenameCancel={
								onRenameCancel ??
								(() => {})
							}
							onContextMenu={
								onContextMenu
							}
							isDropTarget={
								dropTargetPath ===
								item.path
							}
							onDragStart={
								onDragStart
							}
							onDragOver={
								onDragOver
							}
							onDragLeave={
								onDragLeave
							}
							onDrop={onDrop}
							onDragEnd={
								onDragEnd
							}
							onSelectFolder={
								onSelectFolder
							}
						/>
						{children}
					</div>,
				);
				i = nextI;
			} else if (item.kind === 'folder') {
				nodes.push(
					<FolderRow
						key={item.id}
						item={item}
						onToggle={onToggleFolder}
						onCreateFile={onCreateFile}
						onPlusClick={onPlusClick}
						rowHeight={folderRowHeight}
						isRenaming={
							renamingPath ===
							item.path
						}
						renameValue={
							renameValue ?? ''
						}
						renameInputRef={
							renameInputRef ?? {
								current: null,
							}
						}
						onRenameChange={
							onRenameChange ??
							(() => {})
						}
						onRenameConfirm={
							onRenameConfirm ??
							(() => {})
						}
						onRenameCancel={
							onRenameCancel ??
							(() => {})
						}
						onContextMenu={
							onContextMenu
						}
						isDropTarget={
							dropTargetPath ===
							item.path
						}
						onDragStart={onDragStart}
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						onDrop={onDrop}
						onDragEnd={onDragEnd}
						onSelectFolder={
							onSelectFolder
						}
					/>,
				);
				i++;
			} else {
				nodes.push(
					<FileRow
						key={item.id}
						item={item}
						isSelected={
							item.path === selectedPath
						}
						isMultiSelected={
							selectedPaths.has(
								item.path,
							) &&
							item.path !== selectedPath
						}
						isDeleteConfirm={
							deleteConfirmId ===
							item.path
						}
						onItemClick={onItemClick}
						onDelete={handleDelete}
						onDeleteCancel={
							handleDeleteCancel
						}
						isRenaming={
							renamingPath ===
							item.path
						}
						renameValue={
							renameValue ?? ''
						}
						renameInputRef={
							renameInputRef ?? {
								current: null,
							}
						}
						onRenameChange={
							onRenameChange ??
							(() => {})
						}
						onRenameConfirm={
							onRenameConfirm ??
							(() => {})
						}
						onRenameCancel={
							onRenameCancel ??
							(() => {})
						}
						onContextMenu={
							onContextMenu
						}
						onDragStart={onDragStart}
						onDragEnd={onDragEnd}
						sortMode={sortMode}
					/>,
				);
				i++;
			}
		}

		return [nodes, i];
	};

	const [treeContent] = renderItems(0, 0);

	return (
		<div className="table-container items-table">
			<SearchSortControls
				ref={searchRef}
				leadingContent={leadingContent}
				searchQuery={searchQuery}
				onSearchQueryChange={setSearchQuery}
				sortMode={sortMode}
				onCycleSortMode={onCycleSortMode}
				searchPlaceholder="Search  ⌘K"
				onArrowNav={navigateItems}
			/>
			{headerActions}
			<div className="table-wrapper">
				<div
					ref={containerRef}
					className="table-body-scroll scrollbar-hover"
					onDragOver={
						workspacePath
							? (e) => {
									if (
										e.target !==
										e.currentTarget
									)
										return;
									onDragOver?.(
										e,
										workspacePath,
									);
								}
							: undefined
					}
					onDrop={
						workspacePath
							? (e) => {
									if (
										e.target !==
										e.currentTarget
									)
										return;
									onDrop?.(
										e,
										workspacePath,
									);
								}
							: undefined
					}
					onContextMenu={(e) => {
						if (
							e.target ===
							e.currentTarget
						) {
							e.preventDefault();
							onContextMenu?.(
								e,
								null,
							);
						}
					}}
				>
					{treeContent}
				</div>
			</div>
		</div>
	);
};
