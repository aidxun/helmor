import type {
	BacklogCreateRequest,
	BacklogCreateResult,
	CompanionHealth,
	CompanionStreamEvent,
	MobileRepositoryOption,
	SendMessageStreamRequest,
	SendNewWorkspaceStreamRequest,
	SessionThreadMessagesPage,
	SessionThreadPageRequest,
	WorkspaceSessionSummary,
	WorkspaceSnapshot,
} from "./types";

export type RemoteProgress = (message: string) => void;

export class DesktopRpcClient {
	private readonly baseUrl: string;

	constructor(
		private readonly connection: {
			host: string;
			pat: string;
		},
	) {
		this.baseUrl = normalizeBaseUrl(connection.host);
	}

	get connectedHost(): string {
		return this.connection.host;
	}

	async health(): Promise<CompanionHealth> {
		return this.request<CompanionHealth>("/v1/health");
	}

	async initialize(): Promise<CompanionHealth> {
		return this.health();
	}

	async workspaceSnapshot(): Promise<WorkspaceSnapshot> {
		return this.request<WorkspaceSnapshot>("/v1/workspaces");
	}

	async listRepositories(): Promise<MobileRepositoryOption[]> {
		return this.request<MobileRepositoryOption[]>("/v1/repositories");
	}

	async listWorkspaceSessions(
		workspaceId: string,
	): Promise<WorkspaceSessionSummary[]> {
		const search = new URLSearchParams({ workspaceId });
		return this.request<WorkspaceSessionSummary[]>(`/v1/sessions?${search}`);
	}

	async sessionThreadPage(
		request: SessionThreadPageRequest,
	): Promise<SessionThreadMessagesPage> {
		const search = new URLSearchParams();
		if (request.tailLimit !== undefined && request.tailLimit !== null) {
			search.set("tailLimit", String(request.tailLimit));
		}
		const suffix = search.toString() ? `?${search}` : "";
		return this.request<SessionThreadMessagesPage>(
			`/v1/sessions/${encodeURIComponent(request.sessionId)}/thread${suffix}`,
		);
	}

	async markSessionRead(sessionId: string): Promise<void> {
		await this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/read`, {
			method: "POST",
		});
	}

	async createBacklogTask(
		request: BacklogCreateRequest,
	): Promise<BacklogCreateResult> {
		return this.request<BacklogCreateResult>("/v1/backlog", {
			method: "POST",
			body: JSON.stringify(request),
		});
	}

	async sendSessionMessageStream(
		sessionId: string,
		request: SendMessageStreamRequest,
		onEvent: (event: CompanionStreamEvent) => void,
	): Promise<void> {
		await this.streamRequest(
			`/v1/sessions/${encodeURIComponent(sessionId)}/send/stream`,
			request,
			onEvent,
		);
	}

	async sendNewWorkspaceStream(
		request: SendNewWorkspaceStreamRequest,
		onEvent: (event: CompanionStreamEvent) => void,
	): Promise<void> {
		await this.streamRequest("/v1/workspaces/send/stream", request, onEvent);
	}

	close() {}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${this.connection.pat}`,
				"Content-Type": "application/json",
				...init.headers,
			},
		});
		if (!response.ok) {
			throw new Error(await responseError(response));
		}
		if (response.status === 204) {
			return undefined as T;
		}
		return (await response.json()) as T;
	}

	private async streamRequest(
		path: string,
		body: unknown,
		onEvent: (event: CompanionStreamEvent) => void,
	): Promise<void> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: "POST",
			headers: {
				Accept: "text/event-stream",
				Authorization: `Bearer ${this.connection.pat}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			throw new Error(await responseError(response));
		}

		const parser = createSseParser(onEvent);
		const stream = response.body;
		if (stream && "getReader" in stream) {
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				parser.push(decoder.decode(value, { stream: true }));
			}
			parser.push(decoder.decode());
			parser.flush();
			return;
		}

		parser.push(await response.text());
		parser.flush();
	}
}

export async function createPairedDesktopClient(
	connection: {
		host: string;
		pat: string;
	},
	_onProgress?: RemoteProgress,
): Promise<DesktopRpcClient> {
	return new DesktopRpcClient(connection);
}

export async function createPairingClient(
	pairing: {
		host: string;
		pat: string;
	},
	_onProgress?: RemoteProgress,
): Promise<DesktopRpcClient> {
	return new DesktopRpcClient(pairing);
}

function normalizeBaseUrl(host: string): string {
	const trimmed = host.trim().replace(/\/+$/, "");
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

async function responseError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		if (body.error) return body.error;
	} catch {}
	return `Companion request failed with ${response.status}`;
}

function createSseParser(onEvent: (event: CompanionStreamEvent) => void) {
	let buffer = "";
	let dataLines: string[] = [];

	function emit() {
		if (dataLines.length === 0) return;
		const data = dataLines.join("\n");
		dataLines = [];
		try {
			onEvent(JSON.parse(data) as CompanionStreamEvent);
		} catch (error) {
			onEvent({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "Failed to parse stream event",
			});
		}
	}

	function processLine(line: string) {
		if (line === "") {
			emit();
			return;
		}
		if (line.startsWith(":")) return;
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trimStart());
		}
	}

	return {
		push(chunk: string) {
			buffer += chunk;
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		},
		flush() {
			if (buffer) {
				processLine(buffer);
				buffer = "";
			}
			emit();
		},
	};
}
