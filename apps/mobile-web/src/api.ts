import type {
	CompanionStreamEvent,
	DesktopConnection,
	SessionThreadMessagesPage,
	UiMutationEnvelope,
	WorkspaceSessionSummary,
	WorkspaceSnapshot,
} from "./types";

export class CompanionClient {
	private readonly baseUrl: string;

	constructor(private readonly connection: DesktopConnection) {
		this.baseUrl = normalizeBaseUrl(connection.host);
	}

	async health(): Promise<void> {
		await this.request("/v1/health");
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
		sessionId: string,
		tailLimit = 200,
	): Promise<SessionThreadMessagesPage> {
		const search = new URLSearchParams({ tailLimit: String(tailLimit) });
		return this.request<SessionThreadMessagesPage>(
			`/v1/sessions/${encodeURIComponent(sessionId)}/thread?${search}`,
		);
	}

	async markSessionRead(sessionId: string): Promise<void> {
		await this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/read`, {
			method: "POST",
		});
	}

	async sendSessionMessageStream(
		sessionId: string,
		prompt: string,
		onEvent: (event: CompanionStreamEvent) => void,
		signal?: AbortSignal,
	): Promise<void> {
		await this.streamRequest<CompanionStreamEvent>(
			`/v1/sessions/${encodeURIComponent(sessionId)}/send/stream`,
			{ prompt },
			onEvent,
			{ method: "POST", signal },
		);
	}

	async streamUiMutations(
		onEvent: (event: UiMutationEnvelope) => void,
		signal?: AbortSignal,
	): Promise<void> {
		await this.streamRequest<UiMutationEnvelope>("/v1/stream", null, onEvent, {
			method: "GET",
			signal,
		});
	}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await window.fetch(`${this.baseUrl}${path}`, {
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

	private async streamRequest<T>(
		path: string,
		body: unknown | null,
		onEvent: (event: T) => void,
		options: {
			method: "GET" | "POST";
			signal?: AbortSignal;
		},
	): Promise<void> {
		const response = await window.fetch(`${this.baseUrl}${path}`, {
			method: options.method,
			headers: {
				Accept: "text/event-stream",
				Authorization: `Bearer ${this.connection.pat}`,
				"Content-Type": "application/json",
			},
			body: body === null ? undefined : JSON.stringify(body),
			signal: options.signal,
		});
		if (!response.ok) {
			throw new Error(await responseError(response));
		}

		const parser = createSseParser(onEvent);
		if (!response.body) {
			parser.push(await response.text());
			parser.flush();
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			parser.push(decoder.decode(value, { stream: true }));
		}
		parser.push(decoder.decode());
		parser.flush();
	}
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

function createSseParser<T>(onEvent: (event: T) => void) {
	let buffer = "";
	let dataLines: string[] = [];

	const dispatch = () => {
		if (dataLines.length === 0) return;
		const data = dataLines.join("\n");
		dataLines = [];
		try {
			onEvent(JSON.parse(data) as T);
		} catch {
			// Keep the stream alive if one event is malformed.
		}
	};

	return {
		push(chunk: string) {
			buffer += chunk;
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex >= 0) {
				const rawLine = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
				if (line === "") {
					dispatch();
				} else if (line.startsWith("data:")) {
					dataLines.push(line.slice(5).trimStart());
				}
				newlineIndex = buffer.indexOf("\n");
			}
		},
		flush() {
			if (buffer.trim()) {
				const line = buffer.trimEnd();
				if (line.startsWith("data:")) {
					dataLines.push(line.slice(5).trimStart());
				}
			}
			dispatch();
			buffer = "";
		},
	};
}
