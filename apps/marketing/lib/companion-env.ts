export type CompanionEnv = {
	cloudflareAccountId: string;
	cloudflareZoneId: string;
	cloudflareApiToken: string;
	companionDomain: string;
	upstashUrl: string;
	upstashToken: string;
};

export function loadCompanionEnv(): CompanionEnv {
	return {
		cloudflareAccountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
		cloudflareZoneId: requiredEnv("CLOUDFLARE_ZONE_ID"),
		cloudflareApiToken: requiredEnv("CLOUDFLARE_API_TOKEN"),
		companionDomain: requiredEnv("HELMOR_COMPANION_DOMAIN"),
		upstashUrl: requiredEnv("UPSTASH_REDIS_REST_URL").replace(/\/+$/, ""),
		upstashToken: requiredEnv("UPSTASH_REDIS_REST_TOKEN"),
	};
}

function requiredEnv(key: string): string {
	const value = process.env[key]?.trim();
	if (!value) {
		throw new Error(`${key} is required`);
	}
	return value;
}
