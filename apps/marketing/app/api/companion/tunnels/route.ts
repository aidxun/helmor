import { type NextRequest, NextResponse } from "next/server";
import {
	configureTunnel,
	createDnsRecord,
	createTunnel,
	deleteTunnel,
} from "@/lib/companion-cf";
import { randomBase32, randomSecret, sha256 } from "@/lib/companion-crypto";
import { loadCompanionEnv } from "@/lib/companion-env";
import { bumpRegisterRateLimit, saveTunnelRecord } from "@/lib/companion-kv";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const env = loadCompanionEnv();
		await bumpRegisterRateLimit(env, clientIp(request));
		const body = (await request.json()) as { localPort?: number };
		const localPort = Number(body.localPort);
		if (!Number.isInteger(localPort) || localPort <= 0 || localPort > 65535) {
			return NextResponse.json(
				{ error: "localPort is required" },
				{ status: 400 },
			);
		}

		const id = randomBase32(12);
		const hostname = `remote-${randomBase32(8)}.${env.companionDomain}`;
		const tunnel = await createTunnel(env, `helmor-${id}`);
		try {
			await configureTunnel(env, tunnel.id, hostname, localPort);
			const dns = await createDnsRecord(env, hostname, tunnel.id);
			const secret = randomSecret("hsec");
			const now = new Date().toISOString();
			await saveTunnelRecord(env, {
				id,
				hostname,
				tunnelId: tunnel.id,
				dnsRecordId: dns.id,
				secretHash: sha256(secret),
				createdAt: now,
				lastSeenAt: now,
			});
			return NextResponse.json({
				id,
				hostname,
				tunnelId: tunnel.id,
				tunnelToken: tunnel.token,
				secret,
			});
		} catch (error) {
			await deleteTunnel(env, tunnel.id).catch(() => {});
			throw error;
		}
	} catch (error) {
		return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
	}
}

function clientIp(request: NextRequest): string {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
