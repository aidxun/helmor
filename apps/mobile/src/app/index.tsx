import { MainHeader } from "@/components/main-header";
import { WorkspaceSummarySurface } from "@/features/workspaces";

export default function WorkspaceScreen() {
	return (
		<>
			<WorkspaceSummarySurface />
			<MainHeader />
		</>
	);
}
