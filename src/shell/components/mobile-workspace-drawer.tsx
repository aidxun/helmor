import { PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { FeedbackButton } from "@/features/feedback";
import { WorkspacesSidebarContainer } from "@/features/navigation/container";
import { SettingsButton } from "@/features/settings";
import { getShortcut } from "@/features/shortcuts/registry";
import { AppUpdateButton } from "@/features/updater/app-update-button";
import type { AppUpdateStatus } from "@/lib/api";
import type { AppSettings } from "@/lib/settings";
import type { PushWorkspaceToast } from "@/lib/workspace-toast-context";

type WorkspaceToast = PushWorkspaceToast;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedWorkspaceId: string | null;
	autoSelectEnabled: boolean;
	busyWorkspaceIds: Set<string>;
	interactionRequiredWorkspaceIds: Set<string>;
	newWorkspaceShortcut: string | null;
	addRepositoryShortcut: string | null;
	sidebarFilterShortcut: string | null;
	appUpdateStatus: AppUpdateStatus | null;
	appSettings: AppSettings;
	onSelectWorkspace: (workspaceId: string | null) => void;
	onOpenNewWorkspace: () => void;
	onAddRepositoryNeedsStart: (repositoryId: string) => void;
	onMoveLocalToWorktree: (workspaceId: string) => void;
	onOpenFeedback: () => void;
	onOpenSettings: () => void;
	pushWorkspaceToast: WorkspaceToast;
};

export function MobileWorkspaceDrawer({
	open,
	onOpenChange,
	selectedWorkspaceId,
	autoSelectEnabled,
	busyWorkspaceIds,
	interactionRequiredWorkspaceIds,
	newWorkspaceShortcut,
	addRepositoryShortcut,
	sidebarFilterShortcut,
	appUpdateStatus,
	appSettings,
	onSelectWorkspace,
	onOpenNewWorkspace,
	onAddRepositoryNeedsStart,
	onMoveLocalToWorktree,
	onOpenFeedback,
	onOpenSettings,
	pushWorkspaceToast,
}: Props) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				showCloseButton={false}
				className="w-[min(336px,92vw)] max-w-none gap-0 overflow-hidden border-sidebar-border bg-sidebar p-0"
			>
				<SheetHeader className="sr-only">
					<SheetTitle>Workspaces</SheetTitle>
					<SheetDescription>
						Browse and select Helmor workspaces.
					</SheetDescription>
				</SheetHeader>
				<div className="relative flex h-full min-w-0 flex-col bg-sidebar">
					<div className="min-h-0 flex-1">
						<WorkspacesSidebarContainer
							selectedWorkspaceId={selectedWorkspaceId}
							autoSelectEnabled={autoSelectEnabled}
							busyWorkspaceIds={busyWorkspaceIds}
							interactionRequiredWorkspaceIds={interactionRequiredWorkspaceIds}
							newWorkspaceShortcut={newWorkspaceShortcut}
							addRepositoryShortcut={addRepositoryShortcut}
							sidebarFilterShortcut={sidebarFilterShortcut}
							onSelectWorkspace={onSelectWorkspace}
							onOpenNewWorkspace={onOpenNewWorkspace}
							onAddRepositoryNeedsStart={onAddRepositoryNeedsStart}
							onMoveLocalToWorktree={onMoveLocalToWorktree}
							pushWorkspaceToast={pushWorkspaceToast}
						/>
					</div>
					<div className="absolute top-[6px] right-[12px] z-20 flex items-center gap-[2px]">
						<AppUpdateButton status={appUpdateStatus} />
						<Button
							aria-label="Close workspace sidebar"
							onClick={() => onOpenChange(false)}
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
						>
							<PanelLeftClose className="size-4" strokeWidth={1.8} />
						</Button>
					</div>
					<div className="flex shrink-0 items-center px-3 pb-3 pt-1">
						<SettingsButton
							onClick={onOpenSettings}
							shortcut={getShortcut(appSettings.shortcuts, "settings.open")}
						/>
						<FeedbackButton onClick={onOpenFeedback} />
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
