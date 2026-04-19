import {
	executeRepoScript,
	resizeRepoScript,
	type ScriptEvent,
	stopRepoScript,
	writeRepoScriptStdin,
} from "@/lib/api";

export type ScriptStatus = "idle" | "running" | "exited";

type Listener = {
	onChunk: (data: string) => void;
	onStatusChange: (status: ScriptStatus) => void;
};

export type ScriptEntry = {
	chunks: string[];
	status: ScriptStatus;
	exitCode: number | null;
};

/** Module-level stores — survive React mount/unmount cycles. */
const entries = new Map<string, ScriptEntry>();
const listeners = new Map<string, Listener>();

function key(workspaceId: string, scriptType: string) {
	return `${workspaceId}:${scriptType}`;
}

export function getScriptState(workspaceId: string, scriptType: string) {
	return entries.get(key(workspaceId, scriptType)) ?? null;
}

export function startScript(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
) {
	const k = key(workspaceId, scriptType);

	const entry: ScriptEntry = {
		chunks: [],
		status: "running",
		exitCode: null,
	};
	entries.set(k, entry);

	listeners.get(k)?.onStatusChange("running");

	executeRepoScript(
		repoId,
		scriptType,
		(event: ScriptEvent) => {
			if (entries.get(k) !== entry) return;

			switch (event.type) {
				case "started":
					break;
				case "stdout":
				case "stderr":
					entry.chunks.push(event.data);
					listeners.get(k)?.onChunk(event.data);
					break;
				case "exited":
					entry.status = "exited";
					entry.exitCode = event.code;
					listeners.get(k)?.onStatusChange("exited");
					break;
				case "error": {
					const msg = `\r\n\x1b[31m${event.message}\x1b[0m\r\n`;
					entry.chunks.push(msg);
					entry.status = "exited";
					listeners.get(k)?.onChunk(msg);
					listeners.get(k)?.onStatusChange("exited");
					break;
				}
			}
		},
		workspaceId,
	).catch((err) => {
		if (entries.get(k) !== entry) return;
		const msg = `\r\n\x1b[31mFailed to start: ${err}\x1b[0m\r\n`;
		entry.chunks.push(msg);
		entry.status = "exited";
		listeners.get(k)?.onChunk(msg);
		listeners.get(k)?.onStatusChange("exited");
	});
}

export function stopScript(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
) {
	void stopRepoScript(repoId, scriptType, workspaceId);
}

/**
 * Forward a keystroke / paste to the backend PTY. Fire-and-forget:
 * xterm produces the bytes synchronously, we don't want typing to await
 * IPC. The backend silently ignores writes if no script is live.
 */
export function writeStdin(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
	data: string,
) {
	void writeRepoScriptStdin(repoId, scriptType, workspaceId, data);
}

/**
 * Forward a terminal resize to the backend PTY. Fire-and-forget for the
 * same reason as writeStdin — resize events fire rapidly during window
 * drags and we don't want to stall the frontend.
 */
export function resizeScript(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
	cols: number,
	rows: number,
) {
	void resizeRepoScript(repoId, scriptType, workspaceId, cols, rows);
}

/** Attach a live listener. Returns current entry for replay, or null. */
export function attach(
	workspaceId: string,
	scriptType: string,
	listener: Listener,
): ScriptEntry | null {
	listeners.set(key(workspaceId, scriptType), listener);
	return entries.get(key(workspaceId, scriptType)) ?? null;
}

/** Detach the live listener (entry stays alive). */
export function detach(workspaceId: string, scriptType: string) {
	listeners.delete(key(workspaceId, scriptType));
}

/** Reset all state. Test-only. */
export function _resetForTesting() {
	entries.clear();
	listeners.clear();
}
