import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomBase32(length: number): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
	const bytes = randomBytes(length);
	let output = "";
	for (const byte of bytes) {
		output += alphabet[byte % alphabet.length];
	}
	return output;
}

export function randomSecret(prefix: string): string {
	return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

export function sha256(value: string): string {
	return createHash("sha256").update(value).digest("base64url");
}

export function secretMatches(
	expectedHash: string,
	candidate: string,
): boolean {
	const expected = Buffer.from(expectedHash);
	const actual = Buffer.from(sha256(candidate));
	if (expected.length !== actual.length) return false;
	return timingSafeEqual(expected, actual);
}
