import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { WorkspaceRow } from "@/lib/api";
import { workspaceStatusFromGroupId } from "@/lib/workspace-helpers";

const LONG_PRESS_MS = 140;
const MOVE_CANCEL_PX = 10;
const DRAGGABLE_ROW_SELECTOR = "[data-workspace-dnd-row='true']";
const DROP_GROUP_SELECTOR = "[data-workspace-drop-group-id]";

type DragStart = {
	workspaceId: string;
	groupId: string;
	title: string;
	clientX: number;
	clientY: number;
	offsetY: number;
	left: number;
	width: number;
	pointerId: number;
};

export type WorkspaceDragState = {
	workspaceId: string;
	title: string;
	sourceGroupId: string;
	targetGroupId: string;
	beforeWorkspaceId: string | null;
	clientX: number;
	clientY: number;
	offsetY: number;
	left: number;
	width: number;
};

export type WorkspaceDropTarget = {
	groupId: string;
	beforeWorkspaceId: string | null;
};

export function isWorkspaceGroupDroppable(groupId: string) {
	return workspaceStatusFromGroupId(groupId) !== null;
}

export function useWorkspaceDnd({
	onMoveWorkspace,
}: {
	onMoveWorkspace?: (
		workspaceId: string,
		targetGroupId: string,
		beforeWorkspaceId: string | null,
	) => void;
}) {
	const [dragState, setDragState] = useState<WorkspaceDragState | null>(null);
	const pendingStartRef = useRef<DragStart | null>(null);
	const longPressTimerRef = useRef<number | null>(null);
	const dragStateRef = useRef<WorkspaceDragState | null>(null);
	dragStateRef.current = dragState;

	const clearPendingStart = useCallback(() => {
		if (longPressTimerRef.current !== null) {
			window.clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
		pendingStartRef.current = null;
	}, []);

	const resolveDropTarget = useCallback(
		(clientX: number, clientY: number): WorkspaceDropTarget | null => {
			const elements = document.elementsFromPoint(clientX, clientY);
			const groupElement = elements
				.map((element) => element.closest(DROP_GROUP_SELECTOR))
				.find(Boolean) as HTMLElement | undefined;
			const groupId = groupElement?.dataset.workspaceDropGroupId;
			if (!groupId || !isWorkspaceGroupDroppable(groupId)) {
				return null;
			}

			const rowElements = Array.from(
				document.querySelectorAll<HTMLElement>(
					`${DRAGGABLE_ROW_SELECTOR}[data-workspace-dnd-group-id="${CSS.escape(groupId)}"]`,
				),
			).filter(
				(element) =>
					element.dataset.workspaceDndRowId !==
					dragStateRef.current?.workspaceId,
			);

			for (const element of rowElements) {
				const rect = element.getBoundingClientRect();
				if (clientY < rect.top + rect.height / 2) {
					return {
						groupId,
						beforeWorkspaceId: element.dataset.workspaceDndRowId ?? null,
					};
				}
			}

			return { groupId, beforeWorkspaceId: null };
		},
		[],
	);

	useEffect(() => {
		const handlePointerMove = (event: PointerEvent) => {
			const active = dragStateRef.current;
			if (active) {
				if (event.pointerId !== pendingStartRef.current?.pointerId) {
					return;
				}
				event.preventDefault();
				const target = resolveDropTarget(event.clientX, event.clientY);
				setDragState((current) =>
					current
						? {
								...current,
								clientX: event.clientX,
								clientY: event.clientY,
								targetGroupId: target?.groupId ?? current.targetGroupId,
								beforeWorkspaceId: target
									? target.beforeWorkspaceId
									: current.beforeWorkspaceId,
							}
						: current,
				);
				return;
			}

			const pending = pendingStartRef.current;
			if (!pending || event.pointerId !== pending.pointerId) {
				return;
			}

			const dx = event.clientX - pending.clientX;
			const dy = event.clientY - pending.clientY;
			if (Math.abs(dx) > MOVE_CANCEL_PX && Math.abs(dx) > Math.abs(dy)) {
				clearPendingStart();
			}
		};

		const handlePointerUp = (event: PointerEvent) => {
			const active = dragStateRef.current;
			if (active && event.pointerId === pendingStartRef.current?.pointerId) {
				event.preventDefault();
				if (
					active.targetGroupId !== active.sourceGroupId ||
					active.beforeWorkspaceId !== active.workspaceId
				) {
					onMoveWorkspace?.(
						active.workspaceId,
						active.targetGroupId,
						active.beforeWorkspaceId,
					);
				}
				setDragState(null);
			}
			clearPendingStart();
		};

		window.addEventListener("pointermove", handlePointerMove, {
			passive: false,
		});
		window.addEventListener("pointerup", handlePointerUp, { passive: false });
		window.addEventListener("pointercancel", handlePointerUp, {
			passive: false,
		});
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
		};
	}, [clearPendingStart, onMoveWorkspace, resolveDropTarget]);

	const startLongPress = useCallback(
		({
			event,
			row,
			groupId,
			title,
		}: {
			event: ReactPointerEvent<HTMLElement>;
			row: WorkspaceRow;
			groupId: string;
			title: string;
		}) => {
			if (
				event.button !== 0 ||
				!isWorkspaceGroupDroppable(groupId) ||
				row.pinnedAt ||
				row.state === "archived"
			) {
				return;
			}

			const target = event.currentTarget;
			const rect = target.getBoundingClientRect();
			clearPendingStart();
			pendingStartRef.current = {
				workspaceId: row.id,
				groupId,
				title,
				clientX: event.clientX,
				clientY: event.clientY,
				offsetY: event.clientY - rect.top,
				left: rect.left,
				width: rect.width,
				pointerId: event.pointerId,
			};

			longPressTimerRef.current = window.setTimeout(() => {
				const pending = pendingStartRef.current;
				if (!pending) return;
				setDragState({
					workspaceId: pending.workspaceId,
					title: pending.title,
					sourceGroupId: pending.groupId,
					targetGroupId: pending.groupId,
					beforeWorkspaceId: row.id,
					clientX: pending.clientX,
					clientY: pending.clientY,
					offsetY: pending.offsetY,
					left: pending.left,
					width: pending.width,
				});
			}, LONG_PRESS_MS);
		},
		[clearPendingStart],
	);

	const dropTarget = useMemo<WorkspaceDropTarget | null>(() => {
		if (!dragState) return null;
		return {
			groupId: dragState.targetGroupId,
			beforeWorkspaceId: dragState.beforeWorkspaceId,
		};
	}, [dragState]);

	return {
		dragState,
		dropTarget,
		startLongPress,
	};
}
