import { type NextRequest, NextResponse } from "next/server";
import { deleteDnsRecord, deleteTunnel } from "@/lib/companion-cf";
import { secretMatches } from "@/lib/companion-crypto";
import { loadCompanionEnv } from "@/lib/companion-env";
import { deleteTunnelRecord, loadTunnelRecord } from "@/lib/companion-kv";

export const runtime = "nodejs";

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const env = loadCompanionEnv();
		const { id } = await params;
		const record = await loadTunnelRecord(env, id);
		if (!record) {
			return NextResponse.json({ error: "Tunnel not found" }, { status: 404 });
		}
		const secret = request.headers
			.get("authorization")
			?.trim()
			.replace(/^Bearer\s+/i, "");
		if (!secret || !secretMatches(record.secretHash, secret)) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		await deleteDnsRecord(env, record.dnsRecordId).catch(() => {});
		await deleteTunnel(env, record.tunnelId).catch(() => {});
		await deleteTunnelRecord(env, id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
