import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Archive,
	ChevronRight,
	Folder,
	FolderPlus,
	Globe,
	LoaderCircle,
	Plus,
} from "lucide-react";
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { WorkspaceGroup, WorkspaceRow, WorkspaceStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CloneFromUrlDialog } from "./clone-from-url-dialog";
import {
	createInitialSectionOpenState,
	readStoredSectionOpenState,
	writeStoredSectionOpenState,
} from "./open-state";
import { WorkspaceRowItem } from "./row-item";
import {
	ARCHIVED_SECTION_ID,
	findSelectedSectionId,
	GroupIcon,
} from "./shared";

// ---------------------------------------------------------------------------
// Virtual list item types
// ---------------------------------------------------------------------------

type VirtualItem =
	| {
			kind: "group-header";
			groupId: string;
			group: WorkspaceGroup;
			canCollapse: boolean;
	  }
	| { kind: "row"; groupId: string; row: WorkspaceRow; isArchived: boolean }
	| { kind: "group-gap"; size: number }
	| { kind: "bottom-padding" };

const HEADER_HEIGHT = 34; // unified header height for all groups
const ROW_HEIGHT = 32; // 30px (h-7.5) + 2px gap
const GROUP_GAP = 8; // tighter gap between populated groups
const EMPTY_GROUP_GAP = 8; // tighter spacing around empty groups
const BOTTOM_PADDING = 8;
const DRAG_START_DISTANCE_PX = 5;
const DRAG_AUTO_SCROLL_EDGE_PX = 44;
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 14;

type WorkspaceDragState = {
	activeWorkspaceId: string;
	activeGroupId: string;
	sourceIndex: number;
	targetIndex: number;
	currentOffsetY: number;
};

type WorkspaceDragSession = {
	activeWorkspaceId: string;
	activeGroupId: string;
	groupRowIds: string[];
	sourceIndex: number;
	startX: number;
	startY: number;
	startScrollTop: number;
	latestClientY: number;
	dragging: boolean;
};

function getWorkspaceDragStateForClientY(
	session: WorkspaceDragSession,
	clientY: number,
	scrollTop: number,
): WorkspaceDragState {
	const scrollDeltaY = scrollTop - session.startScrollTop;
	const minOffsetY = -session.sourceIndex * ROW_HEIGHT;
	const maxOffsetY =
		(session.groupRowIds.length - 1 - session.sourceIndex) * ROW_HEIGHT;
	const currentOffsetY = Math.max(
		minOffsetY,
		Math.min(maxOffsetY, clientY - session.startY + scrollDeltaY),
	);
	const targetIndex = Math.max(
		0,
		Math.min(
			session.groupRowIds.length - 1,
			session.sourceIndex + Math.round(currentOffsetY / ROW_HEIGHT),
		),
	);

	return {
		activeWorkspaceId: session.activeWorkspaceId,
		activeGroupId: session.activeGroupId,
		sourceIndex: session.sourceIndex,
		targetIndex,
		currentOffsetY,
	};
}

function getGroupHeaderHeight(_hasRows: boolean) {
	return HEADER_HEIGHT;
}

function getGroupGapSize(previousHasRows: boolean, nextHasRows: boolean) {
	return previousHasRows && nextHasRows ? GROUP_GAP : EMPTY_GROUP_GAP;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WorkspacesSidebar = memo(function WorkspacesSidebar({
	groups,
	archivedRows,
	addingRepository,
	selectedWorkspaceId,
	busyWorkspaceIds,
	interactionRequiredWorkspaceIds,
	newWorkspaceShortcut,
	addRepositoryShortcut,
	creatingWorkspaceRepoId,
	onAddRepository,
	onOpenCloneDialog,
	isCloneDialogOpen,
	onCloneDialogOpenChange,
	cloneDefaultDirectory,
	onSubmitClone,
	onSelectWorkspace,
	onPrefetchWorkspace,
	onOpenNewWorkspace,
	onArchiveWorkspace,
	onMoveLocalToWorktree,
	onMarkWorkspaceUnread,
	onRestoreWorkspace,
	onDeleteWorkspace,
	onOpenInFinder,
	onReorderWorkspaceWithinGroup,
	onTogglePin,
	onSetWorkspaceStatus,
	archivingWorkspaceIds,
	markingUnreadWorkspaceId,
	restoringWorkspaceId,
}: {
	groups: WorkspaceGroup[];
	archivedRows: WorkspaceRow[];
	addingRepository?: boolean;
	selectedWorkspaceId?: string | null;
	busyWorkspaceIds?: Set<string>;
	interactionRequiredWorkspaceIds?: Set<string>;
	newWorkspaceShortcut?: string | null;
	addRepositoryShortcut?: string | null;
	creatingWorkspaceRepoId?: string | null;
	onAddRepository?: () => void;
	onOpenCloneDialog?: () => void;
	isCloneDialogOpen?: boolean;
	onCloneDialogOpenChange?: (open: boolean) => void;
	cloneDefaultDirectory?: string | null;
	onSubmitClone?: (args: {
		gitUrl: string;
		cloneDirectory: string;
	}) => Promise<void>;
	onSelectWorkspace?: (workspaceId: string) => void;
	onPrefetchWorkspace?: (workspaceId: string) => void;
	onOpenNewWorkspace?: () => void;
	onArchiveWorkspace?: (workspaceId: string) => void;
	onMoveLocalToWorktree?: (workspaceId: string) => void;
	onMarkWorkspaceUnread?: (workspaceId: string) => void;
	onRestoreWorkspace?: (workspaceId: string) => void;
	onDeleteWorkspace?: (workspaceId: string) => void;
	onOpenInFinder?: (workspaceId: string) => void;
	onReorderWorkspaceWithinGroup?: (args: {
		workspaceId: string;
		beforeWorkspaceId?: string | null;
		afterWorkspaceId?: string | null;
	}) => void;
	onTogglePin?: (workspaceId: string, currentlyPinned: boolean) => void;
	onSetWorkspaceStatus?: (workspaceId: string, status: WorkspaceStatus) => void;
	archivingWorkspaceIds?: Set<string>;
	markingUnreadWorkspaceId?: string | null;
	restoringWorkspaceId?: string | null;
}) {
	const [isAddRepositoryMenuOpen, setIsAddRepositoryMenuOpen] = useState(false);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const dragSessionRef = useRef<WorkspaceDragSession | null>(null);
	const dragCleanupRef = useRef<() => void>(() => {});
	const dragStateRef = useRef<WorkspaceDragState | null>(null);
	const dragUpdateFrameRef = useRef<number | null>(null);
	const dragPendingClientYRef = useRef<number | null>(null);
	const dragAutoScrollFrameRef = useRef<number | null>(null);
	const dragAutoScrollStepRef = useRef(0);
	const suppressNextSelectRef = useRef<string | null>(null);
	const [dragState, setDragState] = useState<WorkspaceDragState | null>(null);
	const setWorkspaceDragState = useCallback(
		(
			next:
				| WorkspaceDragState
				| null
				| ((current: WorkspaceDragState | null) => WorkspaceDragState | null),
		) => {
			const resolved =
				typeof next === "function" ? next(dragStateRef.current) : next;
			dragStateRef.current = resolved;
			setDragState(resolved);
		},
		[],
	);
	const [sectionOpenState, setSectionOpenState] = useState(() => ({
		...createInitialSectionOpenState(groups),
		...readStoredSectionOpenState(),
	}));

	useEffect(() => {
		setSectionOpenState((current) => {
			const next: Record<string, boolean> = {};
			let changed = false;

			for (const group of groups) {
				const nextValue = current[group.id] ?? true;
				next[group.id] = nextValue;
				if (current[group.id] !== nextValue) {
					changed = true;
				}
			}

			const archivedValue = current[ARCHIVED_SECTION_ID] ?? false;
			next[ARCHIVED_SECTION_ID] = archivedValue;
			if (current[ARCHIVED_SECTION_ID] !== archivedValue) {
				changed = true;
			}

			if (Object.keys(current).length !== Object.keys(next).length) {
				changed = true;
			}

			return changed ? next : current;
		});
	}, [archivedRows, groups]);

	useEffect(() => {
		writeStoredSectionOpenState(sectionOpenState);
	}, [sectionOpenState]);

	// Auto-expand the group containing the selected workspace, but ONLY when
	// the selection actually changes — not on every groups refetch (window
	// focus, invalidation, status change). Without this guard, collapsed
	// groups reopen whenever their data refreshes.
	const lastAutoExpandedIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (
			!selectedWorkspaceId ||
			selectedWorkspaceId === lastAutoExpandedIdRef.current
		) {
			return;
		}

		const selectedSectionId = findSelectedSectionId(
			selectedWorkspaceId,
			groups,
			archivedRows,
		);

		if (!selectedSectionId) {
			return;
		}

		lastAutoExpandedIdRef.current = selectedWorkspaceId;
		setSectionOpenState((current) =>
			current[selectedSectionId]
				? current
				: { ...current, [selectedSectionId]: true },
		);
	}, [archivedRows, groups, selectedWorkspaceId]);

	// ── Flatten groups into virtual items ──────────────────────────────
	const flatItems = useMemo(() => {
		const items: VirtualItem[] = [];
		const visibleGroups = groups.filter(
			(g) => g.id !== "pinned" || g.rows.length > 0,
		);

		for (let gi = 0; gi < visibleGroups.length; gi++) {
			const group = visibleGroups[gi];
			if (gi > 0) {
				const previousGroup = visibleGroups[gi - 1];
				items.push({
					kind: "group-gap",
					size: getGroupGapSize(
						previousGroup.rows.length > 0,
						group.rows.length > 0,
					),
				});
			}

			const canCollapse = group.rows.length > 0;
			items.push({
				kind: "group-header",
				groupId: group.id,
				group,
				canCollapse,
			});

			if (sectionOpenState[group.id] !== false && group.rows.length > 0) {
				for (const row of group.rows) {
					items.push({
						kind: "row",
						groupId: group.id,
						row,
						isArchived: false,
					});
				}
			}
		}

		// Archived section
		const previousGroup = visibleGroups.at(-1);
		items.push({
			kind: "group-gap",
			size: getGroupGapSize(
				(previousGroup?.rows.length ?? 0) > 0,
				archivedRows.length > 0,
			),
		});
		items.push({
			kind: "group-header",
			groupId: ARCHIVED_SECTION_ID,
			group: {
				id: ARCHIVED_SECTION_ID,
				label: "Archived",
				tone: "backlog" as WorkspaceGroup["tone"],
				rows: archivedRows,
			},
			canCollapse: archivedRows.length > 0,
		});

		if (sectionOpenState[ARCHIVED_SECTION_ID] && archivedRows.length > 0) {
			for (const row of archivedRows) {
				items.push({
					kind: "row",
					groupId: ARCHIVED_SECTION_ID,
					row,
					isArchived: true,
				});
			}
		}

		items.push({ kind: "bottom-padding" });
		return items;
	}, [groups, archivedRows, sectionOpenState]);

	const dragOffsetsByWorkspaceId = useMemo(() => {
		const offsets = new Map<string, number>();
		if (!dragState) {
			return offsets;
		}

		offsets.set(dragState.activeWorkspaceId, dragState.currentOffsetY);
		if (dragState.targetIndex === dragState.sourceIndex) {
			return offsets;
		}

		const group = groups.find((candidate) =>
			candidate.rows.some((row) => row.id === dragState.activeWorkspaceId),
		);
		if (!group) {
			return offsets;
		}

		const { sourceIndex, targetIndex } = dragState;
		if (targetIndex > sourceIndex) {
			for (let index = sourceIndex + 1; index <= targetIndex; index += 1) {
				const row = group.rows[index];
				if (row) {
					offsets.set(row.id, -ROW_HEIGHT);
				}
			}
		} else {
			for (let index = targetIndex; index < sourceIndex; index += 1) {
				const row = group.rows[index];
				if (row) {
					offsets.set(row.id, ROW_HEIGHT);
				}
			}
		}

		return offsets;
	}, [dragState, groups]);

	// ── Virtualizer ───────────────────────────────────────────────────
	const virtualizer = useVirtualizer({
		count: flatItems.length,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: (index) => {
			const item = flatItems[index];
			switch (item.kind) {
				case "group-header":
					return getGroupHeaderHeight(item.group.rows.length > 0);
				case "row":
					return ROW_HEIGHT;
				case "group-gap":
					return item.size;
				case "bottom-padding":
					return BOTTOM_PADDING;
			}
		},
		getItemKey: (index) => {
			const item = flatItems[index];
			switch (item.kind) {
				case "group-header":
					return `header-${item.groupId}`;
				case "row":
					return `row-${item.groupId}-${item.row.id}`;
				case "group-gap":
					return `gap-${index}`;
				case "bottom-padding":
					return "bottom-padding";
			}
		},
		overscan: 12,
	});

	// ── Scroll selected into view ─────────────────────────────────────
	useLayoutEffect(() => {
		if (!selectedWorkspaceId) return;

		const targetIndex = flatItems.findIndex(
			(item) => item.kind === "row" && item.row.id === selectedWorkspaceId,
		);
		if (targetIndex === -1) return;

		virtualizer.scrollToIndex(targetIndex, { align: "auto" });
	}, [selectedWorkspaceId, sectionOpenState, flatItems, virtualizer]);

	const workspaceActionsBusy = Boolean(
		addingRepository || markingUnreadWorkspaceId || restoringWorkspaceId,
	);
	const createBusy = Boolean(creatingWorkspaceRepoId);
	const addRepositoryBusy = Boolean(addingRepository);

	useEffect(() => {
		const handleOpenNewWorkspace = () => {
			if (addRepositoryBusy || createBusy || workspaceActionsBusy) return;
			onOpenNewWorkspace?.();
		};

		window.addEventListener(
			"helmor:open-new-workspace",
			handleOpenNewWorkspace,
		);
		return () =>
			window.removeEventListener(
				"helmor:open-new-workspace",
				handleOpenNewWorkspace,
			);
	}, [addRepositoryBusy, createBusy, onOpenNewWorkspace, workspaceActionsBusy]);

	useEffect(() => {
		const handleOpenAddRepository = () => {
			if (addRepositoryBusy || createBusy || workspaceActionsBusy) return;
			setIsAddRepositoryMenuOpen(true);
		};

		window.addEventListener(
			"helmor:open-add-repository",
			handleOpenAddRepository,
		);
		return () =>
			window.removeEventListener(
				"helmor:open-add-repository",
				handleOpenAddRepository,
			);
	}, [addRepositoryBusy, createBusy, workspaceActionsBusy]);

	// ── Toggle section ────────────────────────────────────────────────
	const toggleSection = useCallback((groupId: string) => {
		setSectionOpenState((current) => ({
			...current,
			[groupId]: !current[groupId],
		}));
	}, []);

	const handleSelectWorkspaceFromRow = useCallback(
		(workspaceId: string) => {
			if (suppressNextSelectRef.current === workspaceId) {
				suppressNextSelectRef.current = null;
				return;
			}
			onSelectWorkspace?.(workspaceId);
		},
		[onSelectWorkspace],
	);

	const stopWorkspaceDragAutoScroll = useCallback(() => {
		if (dragAutoScrollFrameRef.current !== null) {
			window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
			dragAutoScrollFrameRef.current = null;
		}
		dragAutoScrollStepRef.current = 0;
	}, []);

	const finishWorkspaceDrag = useCallback(() => {
		const session = dragSessionRef.current;
		const current = session?.dragging
			? getWorkspaceDragStateForClientY(
					session,
					session.latestClientY,
					scrollContainerRef.current?.scrollTop ?? 0,
				)
			: dragStateRef.current;
		dragSessionRef.current = null;
		document.body.style.userSelect = "";
		stopWorkspaceDragAutoScroll();
		if (dragUpdateFrameRef.current !== null) {
			window.cancelAnimationFrame(dragUpdateFrameRef.current);
			dragUpdateFrameRef.current = null;
		}
		dragPendingClientYRef.current = null;
		setWorkspaceDragState(null);

		if (
			!current ||
			!session?.dragging ||
			current.targetIndex === current.sourceIndex
		) {
			return;
		}

		const rowIdsWithoutActive = session.groupRowIds.filter(
			(id) => id !== current.activeWorkspaceId,
		);
		const beforeWorkspaceId = rowIdsWithoutActive[current.targetIndex] ?? null;
		const afterWorkspaceId =
			beforeWorkspaceId === null
				? (rowIdsWithoutActive[current.targetIndex - 1] ?? null)
				: null;

		onReorderWorkspaceWithinGroup?.({
			workspaceId: current.activeWorkspaceId,
			beforeWorkspaceId,
			afterWorkspaceId,
		});
	}, [
		onReorderWorkspaceWithinGroup,
		setWorkspaceDragState,
		stopWorkspaceDragAutoScroll,
	]);

	const updateWorkspaceDragTarget = useCallback(
		(clientY: number) => {
			const session = dragSessionRef.current;
			if (!session) {
				return;
			}

			session.latestClientY = clientY;
			const nextState = getWorkspaceDragStateForClientY(
				session,
				clientY,
				scrollContainerRef.current?.scrollTop ?? 0,
			);
			setWorkspaceDragState((current) =>
				current &&
				current.targetIndex === nextState.targetIndex &&
				current.currentOffsetY === nextState.currentOffsetY
					? current
					: nextState,
			);
		},
		[setWorkspaceDragState],
	);

	const scheduleWorkspaceDragTargetUpdate = useCallback(
		(clientY: number) => {
			dragPendingClientYRef.current = clientY;
			if (dragUpdateFrameRef.current !== null) {
				return;
			}

			dragUpdateFrameRef.current = window.requestAnimationFrame(() => {
				dragUpdateFrameRef.current = null;
				const pendingClientY = dragPendingClientYRef.current;
				dragPendingClientYRef.current = null;
				if (pendingClientY !== null) {
					updateWorkspaceDragTarget(pendingClientY);
				}
			});
		},
		[updateWorkspaceDragTarget],
	);

	const updateWorkspaceDragAutoScroll = useCallback(
		(clientY: number) => {
			const scrollElement = scrollContainerRef.current;
			const session = dragSessionRef.current;
			if (!scrollElement || !session?.dragging) {
				stopWorkspaceDragAutoScroll();
				return;
			}

			const rect = scrollElement.getBoundingClientRect();
			const topDistance = clientY - rect.top;
			const bottomDistance = rect.bottom - clientY;
			let nextStep = 0;

			if (topDistance < DRAG_AUTO_SCROLL_EDGE_PX) {
				const ratio = Math.max(
					0,
					(DRAG_AUTO_SCROLL_EDGE_PX - topDistance) / DRAG_AUTO_SCROLL_EDGE_PX,
				);
				nextStep = -Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_STEP_PX);
			} else if (bottomDistance < DRAG_AUTO_SCROLL_EDGE_PX) {
				const ratio = Math.max(
					0,
					(DRAG_AUTO_SCROLL_EDGE_PX - bottomDistance) /
						DRAG_AUTO_SCROLL_EDGE_PX,
				);
				nextStep = Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_STEP_PX);
			}

			dragAutoScrollStepRef.current = nextStep;
			if (nextStep === 0) {
				stopWorkspaceDragAutoScroll();
				return;
			}

			if (dragAutoScrollFrameRef.current !== null) {
				return;
			}

			const tick = () => {
				const element = scrollContainerRef.current;
				const activeSession = dragSessionRef.current;
				const step = dragAutoScrollStepRef.current;
				if (!element || !activeSession?.dragging || step === 0) {
					dragAutoScrollFrameRef.current = null;
					dragAutoScrollStepRef.current = 0;
					return;
				}

				const before = element.scrollTop;
				element.scrollTop = Math.max(
					0,
					Math.min(
						element.scrollHeight - element.clientHeight,
						element.scrollTop + step,
					),
				);

				if (element.scrollTop !== before) {
					updateWorkspaceDragTarget(activeSession.latestClientY);
					dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
					return;
				}

				dragAutoScrollFrameRef.current = null;
			};

			dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
		},
		[stopWorkspaceDragAutoScroll, updateWorkspaceDragTarget],
	);

	const handleWorkspacePointerMove = useCallback(
		(event: PointerEvent) => {
			const session = dragSessionRef.current;
			if (!session) {
				return;
			}

			const distance = Math.hypot(
				event.clientX - session.startX,
				event.clientY - session.startY,
			);
			if (!session.dragging) {
				if (distance < DRAG_START_DISTANCE_PX) {
					return;
				}
				session.dragging = true;
				suppressNextSelectRef.current = session.activeWorkspaceId;
				document.body.style.userSelect = "none";
				setWorkspaceDragState({
					activeWorkspaceId: session.activeWorkspaceId,
					activeGroupId: session.activeGroupId,
					sourceIndex: session.sourceIndex,
					targetIndex: session.sourceIndex,
					currentOffsetY: 0,
				});
			}

			event.preventDefault();
			session.latestClientY = event.clientY;
			scheduleWorkspaceDragTargetUpdate(event.clientY);
			updateWorkspaceDragAutoScroll(event.clientY);
		},
		[
			scheduleWorkspaceDragTargetUpdate,
			setWorkspaceDragState,
			updateWorkspaceDragAutoScroll,
		],
	);

	const handleWorkspaceReorderPointerDown = useCallback(
		(
			row: WorkspaceRow,
			groupId: string,
			event: React.PointerEvent<HTMLDivElement>,
		) => {
			if (
				event.button !== 0 ||
				groupId === ARCHIVED_SECTION_ID ||
				row.state === "archived" ||
				!onReorderWorkspaceWithinGroup
			) {
				return;
			}

			const target = event.target as HTMLElement;
			if (
				target.closest(
					"button,a,input,textarea,select,[role='menuitem'],[data-no-row-drag]",
				)
			) {
				return;
			}

			const group = groups.find((candidate) => candidate.id === groupId);
			const groupRowIds = group?.rows.map((item) => item.id) ?? [];
			const sourceIndex = groupRowIds.indexOf(row.id);
			if (sourceIndex === -1) {
				return;
			}

			dragSessionRef.current = {
				activeWorkspaceId: row.id,
				activeGroupId: groupId,
				groupRowIds,
				sourceIndex,
				startX: event.clientX,
				startY: event.clientY,
				startScrollTop: scrollContainerRef.current?.scrollTop ?? 0,
				latestClientY: event.clientY,
				dragging: false,
			};
			dragCleanupRef.current();

			const handlePointerMove = (nativeEvent: PointerEvent) => {
				handleWorkspacePointerMove(nativeEvent);
			};
			const handlePointerUp = (nativeEvent: PointerEvent) => {
				dragCleanupRef.current();
				if (dragSessionRef.current?.dragging) {
					nativeEvent.preventDefault();
				}
				finishWorkspaceDrag();
			};
			dragCleanupRef.current = () => {
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", handlePointerUp);
				dragCleanupRef.current = () => {};
			};
			window.addEventListener("pointermove", handlePointerMove, {
				passive: false,
			});
			window.addEventListener("pointerup", handlePointerUp, {
				passive: false,
			});
		},
		[
			finishWorkspaceDrag,
			groups,
			handleWorkspacePointerMove,
			onReorderWorkspaceWithinGroup,
		],
	);

	useEffect(() => {
		return () => {
			dragCleanupRef.current();
			stopWorkspaceDragAutoScroll();
			if (dragUpdateFrameRef.current !== null) {
				window.cancelAnimationFrame(dragUpdateFrameRef.current);
			}
			document.body.style.userSelect = "";
		};
	}, [stopWorkspaceDragAutoScroll]);

	// ── Render a single virtual item ──────────────────────────────────
	const renderItem = useCallback(
		(item: VirtualItem) => {
			if (item.kind === "group-gap" || item.kind === "bottom-padding") {
				return null;
			}

			if (item.kind === "group-header") {
				const isOpen =
					item.groupId === ARCHIVED_SECTION_ID
						? (sectionOpenState[item.groupId] ?? false)
						: (sectionOpenState[item.groupId] ?? true);
				const isArchived = item.groupId === ARCHIVED_SECTION_ID;
				const isEmptyGroup = item.group.rows.length === 0;

				return (
					<button
						type="button"
						className={cn(
							"group/trigger flex w-full select-none items-center justify-between rounded-lg px-2 text-[13px] font-semibold tracking-[-0.01em] text-foreground hover:bg-accent/60",
							"py-1",
							item.canCollapse ? "cursor-pointer" : "cursor-default",
						)}
						data-empty-group={isEmptyGroup ? "true" : "false"}
						disabled={!item.canCollapse}
						onClick={() => toggleSection(item.groupId)}
					>
						<span className="flex items-center gap-2">
							{isArchived ? (
								<Archive
									className="size-[14px] shrink-0 text-[var(--workspace-sidebar-status-backlog)]"
									strokeWidth={1.9}
								/>
							) : (
								<GroupIcon tone={item.group.tone} />
							)}
							<span>{item.group.label}</span>
						</span>

						{item.group.rows.length > 0 ? (
							<span className="relative flex h-5 min-w-5 items-center justify-center">
								<Badge
									variant="secondary"
									className="h-4 min-w-[16px] justify-center rounded-full px-1 text-[9.5px] leading-none transition-opacity group-hover/trigger:opacity-0"
								>
									{item.group.rows.length}
								</Badge>
								<ChevronRight
									className={cn(
										"absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground opacity-0 transition-all group-hover/trigger:opacity-100",
										isOpen && "rotate-90",
									)}
									strokeWidth={2}
								/>
							</span>
						) : null}
					</button>
				);
			}

			// kind === "row"
			return (
				<div className="pl-2">
					<WorkspaceRowItem
						row={item.row}
						selected={selectedWorkspaceId === item.row.id}
						isDragging={dragState?.activeWorkspaceId === item.row.id}
						dragOffsetY={dragOffsetsByWorkspaceId.get(item.row.id) ?? 0}
						dropIndicator={null}
						isSending={busyWorkspaceIds?.has(item.row.id)}
						isInteractionRequired={interactionRequiredWorkspaceIds?.has(
							item.row.id,
						)}
						onSelect={handleSelectWorkspaceFromRow}
						onPrefetch={onPrefetchWorkspace}
						onReorderPointerDown={(row, event) =>
							handleWorkspaceReorderPointerDown(row, item.groupId, event)
						}
						onArchiveWorkspace={onArchiveWorkspace}
						onMoveLocalToWorktree={onMoveLocalToWorktree}
						onMarkWorkspaceUnread={onMarkWorkspaceUnread}
						onOpenInFinder={onOpenInFinder}
						onTogglePin={onTogglePin}
						onSetWorkspaceStatus={onSetWorkspaceStatus}
						archivingWorkspaceIds={archivingWorkspaceIds}
						markingUnreadWorkspaceId={markingUnreadWorkspaceId}
						restoringWorkspaceId={restoringWorkspaceId}
						workspaceActionsDisabled={Boolean(
							markingUnreadWorkspaceId || restoringWorkspaceId,
						)}
						{...(item.isArchived
							? {
									onRestoreWorkspace,
									onDeleteWorkspace,
								}
							: {})}
					/>
				</div>
			);
		},
		[
			sectionOpenState,
			toggleSection,
			selectedWorkspaceId,
			dragState,
			dragOffsetsByWorkspaceId,
			busyWorkspaceIds,
			interactionRequiredWorkspaceIds,
			onSelectWorkspace,
			handleSelectWorkspaceFromRow,
			handleWorkspaceReorderPointerDown,
			onPrefetchWorkspace,
			onArchiveWorkspace,
			onMoveLocalToWorktree,
			onMarkWorkspaceUnread,
			onRestoreWorkspace,
			onDeleteWorkspace,
			onTogglePin,
			onSetWorkspaceStatus,
			archivingWorkspaceIds,
			markingUnreadWorkspaceId,
			restoringWorkspaceId,
			creatingWorkspaceRepoId,
		],
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<CloneFromUrlDialog
				open={isCloneDialogOpen ?? false}
				onOpenChange={(nextOpen) => onCloneDialogOpenChange?.(nextOpen)}
				defaultCloneDirectory={cloneDefaultDirectory ?? null}
				onSubmit={async (args) => {
					if (!onSubmitClone) {
						return;
					}
					await onSubmitClone(args);
				}}
			/>
			<div
				data-slot="window-safe-top"
				className="flex h-9 shrink-0 items-center pr-3"
			>
				<TrafficLightSpacer side="left" width={94} />
				<div data-tauri-drag-region className="h-full flex-1" />
			</div>

			<div className="mt-1 flex items-center justify-between px-3">
				<h2 className="text-[14px] font-medium tracking-[-0.01em] text-muted-foreground">
					Workspaces
				</h2>

				<div className="flex items-center gap-1 text-muted-foreground">
					<DropdownMenu
						open={isAddRepositoryMenuOpen}
						onOpenChange={setIsAddRepositoryMenuOpen}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										aria-label="Add repository"
										variant="ghost"
										size="icon-xs"
										disabled={
											addRepositoryBusy || createBusy || workspaceActionsBusy
										}
										className={cn(
											"text-muted-foreground",
											addRepositoryBusy || createBusy || workspaceActionsBusy
												? "cursor-not-allowed opacity-60"
												: undefined,
										)}
									>
										{addRepositoryBusy ? (
											<LoaderCircle
												className="size-4 animate-spin"
												strokeWidth={2.1}
											/>
										) : (
											<FolderPlus className="size-4" strokeWidth={2} />
										)}
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent
								side="top"
								sideOffset={4}
								className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
							>
								<span>Add repository</span>
								{addRepositoryShortcut ? (
									<InlineShortcutDisplay
										hotkey={addRepositoryShortcut}
										className="text-background/60"
									/>
								) : null}
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" className="min-w-40">
							<DropdownMenuItem
								onSelect={() => {
									onAddRepository?.();
								}}
							>
								<Folder strokeWidth={2} />
								<span>Open project</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() => {
									onOpenCloneDialog?.();
								}}
							>
								<Globe strokeWidth={2} />
								<span>Clone from URL</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="New workspace"
								variant="ghost"
								size="icon-xs"
								disabled={
									addRepositoryBusy || createBusy || workspaceActionsBusy
								}
								onClick={() => {
									if (addRepositoryBusy || createBusy || workspaceActionsBusy) {
										return;
									}

									onOpenNewWorkspace?.();
								}}
							>
								{createBusy ? (
									<LoaderCircle
										className="size-4 animate-spin"
										strokeWidth={2.1}
									/>
								) : (
									<Plus className="size-4" strokeWidth={2.4} />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent
							side="top"
							sideOffset={4}
							className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
						>
							<span>Create new workspace</span>
							{newWorkspaceShortcut ? (
								<InlineShortcutDisplay
									hotkey={newWorkspaceShortcut}
									className="text-background/60"
								/>
							) : null}
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Virtualized workspace list */}
			<div
				ref={scrollContainerRef}
				data-slot="workspace-groups-scroll"
				className="scrollbar-stable relative mt-2 min-h-0 flex-1 overflow-y-auto pr-1 pl-2 [scrollbar-width:thin]"
			>
				<div
					style={{
						height: `${virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{virtualizer.getVirtualItems().map((vItem) => (
						<div
							key={vItem.key}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								height: `${vItem.size}px`,
								transform: `translateY(${vItem.start}px)`,
							}}
						>
							{renderItem(flatItems[vItem.index])}
						</div>
					))}
				</div>
			</div>
		</div>
	);
});
