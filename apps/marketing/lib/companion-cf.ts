import type { CompanionEnv } from "./companion-env";

type CloudflareEnvelope<T> = {
	success: boolean;
	result?: T;
	errors?: Array<{ message?: string }>;
};

type CreateTunnelResult = {
	id: string;
	token: string;
};

type CreateDnsResult = {
	id: string;
};

export async function createTunnel(
	env: CompanionEnv,
	name: string,
): Promise<CreateTunnelResult> {
	return cloudflare<CreateTunnelResult>(
		env,
		`/accounts/${env.cloudflareAccountId}/cfd_tunnel`,
		{
			method: "POST",
			body: {
				name,
				config_src: "cloudflare",
			},
		},
	);
}

export async function configureTunnel(
	env: CompanionEnv,
	tunnelId: string,
	hostname: string,
	localPort: number,
): Promise<void> {
	await cloudflare(
		env,
		`/accounts/${env.cloudflareAccountId}/cfd_tunnel/${tunnelId}/configurations`,
		{
			method: "PUT",
			body: {
				config: {
					ingress: [
						{
							hostname,
							service: `http://localhost:${localPort}`,
							originRequest: {},
						},
						{ service: "http_status:404" },
					],
				},
			},
		},
	);
}

export async function createDnsRecord(
	env: CompanionEnv,
	hostname: string,
	tunnelId: string,
): Promise<CreateDnsResult> {
	return cloudflare<CreateDnsResult>(
		env,
		`/zones/${env.cloudflareZoneId}/dns_records`,
		{
			method: "POST",
			body: {
				type: "CNAME",
				proxied: true,
				name: hostname,
				content: `${tunnelId}.cfargotunnel.com`,
			},
		},
	);
}

export async function deleteDnsRecord(
	env: CompanionEnv,
	dnsRecordId: string,
): Promise<void> {
	await cloudflare(
		env,
		`/zones/${env.cloudflareZoneId}/dns_records/${dnsRecordId}`,
		{
			method: "DELETE",
		},
	);
}

export async function deleteTunnel(
	env: CompanionEnv,
	tunnelId: string,
): Promise<void> {
	await cloudflare(
		env,
		`/accounts/${env.cloudflareAccountId}/cfd_tunnel/${tunnelId}`,
		{
			method: "DELETE",
		},
	);
}

async function cloudflare<T = unknown>(
	env: CompanionEnv,
	path: string,
	init: {
		method: "DELETE" | "POST" | "PUT";
		body?: unknown;
	},
): Promise<T> {
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${env.cloudflareApiToken}`,
			"Content-Type": "application/json",
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const envelope = (await response.json()) as CloudflareEnvelope<T>;
	if (!response.ok || !envelope.success) {
		const message =
			envelope.errors
				?.map((error) => error.message)
				.filter(Boolean)
				.join("; ") || `Cloudflare request failed with ${response.status}`;
		throw new Error(message);
	}
	return envelope.result as T;
}
