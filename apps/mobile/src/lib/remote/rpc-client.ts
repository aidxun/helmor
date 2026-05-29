import type {
	BacklogCreateRequest,
	BacklogCreateResult,
	CompanionHealth,
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
