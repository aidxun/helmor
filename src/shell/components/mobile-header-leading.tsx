import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppUpdateButton } from "@/features/updater/app-update-button";
import type { AppUpdateStatus } from "@/lib/api";

type Props = {
	appUpdateStatus: AppUpdateStatus | null;
	onOpenSidebar: () => void;
};

export function MobileHeaderLeading({ appUpdateStatus, onOpenSidebar }: Props) {
	return (
		<div className="flex shrink-0 items-center gap-1">
			<AppUpdateButton status={appUpdateStatus} />
			<Button
				aria-label="Open workspace sidebar"
				onClick={onOpenSidebar}
				variant="ghost"
				size="icon-xs"
				className="text-muted-foreground hover:text-foreground"
			>
				<PanelLeftOpen className="size-4" strokeWidth={1.8} />
			</Button>
		</div>
	);
}
