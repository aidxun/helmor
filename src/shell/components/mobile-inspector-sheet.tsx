import type { ComponentProps } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { ShellInspectorPane } from "./shell-inspector-pane";

type ShellInspectorPaneProps = ComponentProps<typeof ShellInspectorPane>;

type Props = Omit<ShellInspectorPaneProps, "collapsed" | "resizing"> & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function MobileInspectorSheet({
	open,
	onOpenChange,
	width,
	...paneProps
}: Props) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="w-[min(380px,94vw)] max-w-none gap-0 overflow-hidden border-border bg-inspector p-0"
			>
				<SheetHeader className="sr-only">
					<SheetTitle>Inspector</SheetTitle>
					<SheetDescription>
						Review workspace actions, changes, and context.
					</SheetDescription>
				</SheetHeader>
				<ShellInspectorPane
					{...paneProps}
					collapsed={false}
					resizing={false}
					width={Math.min(width, 380)}
				/>
			</SheetContent>
		</Sheet>
	);
}
