import { base64UrlEncode } from "./codec";
import type {
	BacklogCreateRequest,
	BacklogCreateResult,
	JsonRpcResponse,
	PairCompleteResult,
	WorkspaceSnapshot,
} from "./types";

export type RemoteTransport = {
	readonly connectedHost?: string;
	executeRpcPayload(payload: string, method: string): Promise<string>;
	close(): void;
};

export type RemoteProgress = (message: string) => void;

const SSH_CONNECT_TIMEOUT_MS = 5000;

export class DesktopRpcClient {
	constructor(private readonly transport: RemoteTransport) {}

	get connectedHost(): string | undefined {
		return this.transport.connectedHost;
	}

	async initialize(): Promise<unknown> {
		return this.call("initialize", {});
	}

	async completePairing(): Promise<PairCompleteResult> {
		return this.call<PairCompleteResult>("pair.complete", {});
	}

	async workspaceSnapshot(): Promise<WorkspaceSnapshot> {
		return this.call<WorkspaceSnapshot>("workspace.snapshot", {});
	}

	async createBacklogTask(
		request: BacklogCreateRequest,
	): Promise<BacklogCreateResult> {
		return this.call<BacklogCreateResult>("backlog.create", request);
	}

	close() {
		this.transport.close();
	}

	private async call<T>(method: string, params: unknown): Promise<T> {
		const request = {
			jsonrpc: "2.0",
			id: Date.now(),
			method,
			params,
		};
		const raw = await this.transport.executeRpcPayload(
			JSON.stringify(request),
			method,
		);
		const response = JSON.parse(raw.trim()) as JsonRpcResponse<T>;
		if ("error" in response && response.error) {
			throw new Error(response.error.message);
		}
		return response.result;
	}
}

type SshClient = {
	execute(command: string): Promise<string>;
	disconnect(): void;
};

export class SshRpcTransport implements RemoteTransport {
	private constructor(
		private readonly client: SshClient,
		readonly connectedHost: string,
	) {}

	static async connect({
		hosts,
		port,
		username,
		password,
		onProgress,
	}: {
		hosts: string[];
		port: number;
		username: string;
		password: string;
		onProgress?: RemoteProgress;
	}): Promise<SshRpcTransport> {
		const module = await import("@dylankenneally/react-native-ssh-sftp");
		const candidates = normalizeHosts(hosts);
		if (!candidates.length) {
			throw new Error("Pairing payload did not include any desktop hosts");
		}
		const failures: string[] = [];
		for (const host of candidates) {
			try {
				onProgress?.(`Trying ${host}:${port}`);
				const client = await connectWithPasswordWithTimeout(
					module.default,
					host,
					port,
					username,
					password,
					SSH_CONNECT_TIMEOUT_MS,
				);
				onProgress?.(`SSH connected to ${host}:${port}`);
				return new SshRpcTransport(client, host);
			} catch (error) {
				const message = errorMessage(error);
				failures.push(`${host}:${port} - ${message}`);
				onProgress?.(`SSH failed for ${host}:${port}: ${message}`);
			}
		}
		throw new Error(
			`Unable to connect to Helmor desktop. Tried ${failures.join("; ")}`,
		);
	}

	executeRpcPayload(payload: string, method: string): Promise<string> {
		console.info(`[mobile-rpc] ${method}`);
		return this.client.execute(`helmor-mobile-rpc ${base64UrlEncode(payload)}`);
	}

	close() {
		this.client.disconnect();
	}
}

type SshClientConstructor = {
	connectWithPassword(
		host: string,
		port: number,
		username: string,
		password: string,
	): Promise<SshClient>;
};

async function connectWithPasswordWithTimeout(
	sshClient: SshClientConstructor,
	host: string,
	port: number,
	username: string,
	password: string,
	timeoutMs: number,
): Promise<SshClient> {
	let timedOut = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const connectPromise = sshClient
		.connectWithPassword(host, port, username, password)
		.then((client) => {
			if (timedOut) {
				client.disconnect();
				throw new Error(`Connection timed out after ${timeoutMs}ms`);
			}
			return client;
		});
	void connectPromise.catch(() => {});

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeout = setTimeout(() => {
			timedOut = true;
			reject(new Error(`Connection timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([connectPromise, timeoutPromise]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export function prioritizeHosts(
	hosts: string[],
	preferredHost?: string,
): string[] {
	const normalized = normalizeHosts(hosts);
	if (!preferredHost) return normalized;
	return [
		preferredHost,
		...normalized.filter((host) => host !== preferredHost),
	];
}

function normalizeHosts(hosts: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const host of hosts) {
		const candidate = host.trim();
		if (!candidate || seen.has(candidate)) continue;
		seen.add(candidate);
		normalized.push(candidate);
	}
	return normalized;
}

export async function createPairedDesktopClient(
	connection: {
		hosts: string[];
		port: number;
		deviceId: string;
		deviceSecret: string;
	},
	onProgress?: RemoteProgress,
): Promise<DesktopRpcClient> {
	const transport = await SshRpcTransport.connect({
		hosts: connection.hosts,
		port: connection.port,
		username: `device:${connection.deviceId}`,
		password: connection.deviceSecret,
		onProgress,
	});
	return new DesktopRpcClient(transport);
}

export async function createPairingClient(
	pairing: {
		hosts: string[];
		port: number;
		pairingUser: string;
		pairingSecret: string;
	},
	onProgress?: RemoteProgress,
): Promise<DesktopRpcClient> {
	const transport = await SshRpcTransport.connect({
		hosts: pairing.hosts,
		port: pairing.port,
		username: pairing.pairingUser,
		password: pairing.pairingSecret,
		onProgress,
	});
	return new DesktopRpcClient(transport);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
