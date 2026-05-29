import { describe, expect, test } from "bun:test";
import { normalizePairingPayload } from "./pairing-payload";

describe("mobile pairing payload", () => {
	test("accepts compact Cloudflare companion QR payloads", () => {
		expect(
			normalizePairingPayload({
				v: 1,
				h: "mobile.example.com",
				p: "hlm_secret",
				d: "desktop-1",
				n: "Aidan MacBook",
				i: "device-1",
				s: true,
			}),
		).toEqual({
			v: 1,
			host: "mobile.example.com",
			pat: "hlm_secret",
			desktopId: "desktop-1",
			desktopName: "Aidan MacBook",
			deviceId: "device-1",
			stable: true,
		});
	});

	test("rejects old LAN SSH payloads", () => {
		let error: unknown = null;
		try {
			normalizePairingPayload({
				v: 1,
				n: "Aidan MacBook",
				h: ["10.0.0.2", "aidan.local"],
				p: 63344,
				u: "pair:abc",
				s: "secret",
				e: "2026-05-25T12:00:00Z",
			});
		} catch (err) {
			error = err;
		}
		expect(error instanceof Error ? error.message : String(error)).toBe(
			"Invalid pairing payload",
		);
	});
});
