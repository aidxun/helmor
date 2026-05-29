import type { CompanionEnv } from "./companion-env";

export type CompanionTunnelRecord = {
	id: string;
	hostname: string;
	tunnelId: string;
	dnsRecordId: string;
	secretHash: string;
	createdAt: string;
	lastSeenAt: string;
};

export async function saveTunnelRecord(
	env: CompanionEnv,
	record: CompanionTunnelRecord,
): Promise<void> {
	await redis(env, [
		"SET",
		tunnelKey(record.id),
		JSON.stringify(record),
		"EX",
		60 * 60 * 24 * 30,
	]);
}

export async function loadTunnelRecord(
	env: CompanionEnv,
	id: string,
): Promise<CompanionTunnelRecord | null> {
	const result = await redis<string | null>(env, ["GET", tunnelKey(id)]);
	return result ? (JSON.parse(result) as CompanionTunnelRecord) : null;
}

export async function deleteTunnelRecord(
	env: CompanionEnv,
	id: string,
): Promise<void> {
	await redis(env, ["DEL", tunnelKey(id)]);
}

export async function bumpRegisterRateLimit(
	env: CompanionEnv,
	ip: string,
): Promise<void> {
	const key = `companion:ratelimit:${ip}`;
	const count = await redis<number>(env, ["INCR", key]);
	if (count === 1) {
		await redis(env, ["EXPIRE", key, 60 * 60 * 24]);
	}
	if (count > 10) {
		throw new Error("Rate limit exceeded");
	}
}

async function redis<T = unknown>(
	env: CompanionEnv,
	command: Array<string | number>,
): Promise<T> {
	const response = await fetch(env.upstashUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.upstashToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(command),
	});
	const payload = (await response.json()) as { result?: T; error?: string };
	if (!response.ok || payload.error) {
		throw new Error(
			payload.error ?? `Upstash request failed with ${response.status}`,
		);
	}
	return payload.result as T;
}

function tunnelKey(id: string): string {
	return `companion:tunnel:${id}`;
}
