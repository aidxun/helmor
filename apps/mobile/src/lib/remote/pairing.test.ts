import { describe, expect, test } from "bun:test";
import { normalizePairingPayload } from "./pairing-payload";
import { prioritizeHosts } from "./rpc-client";

describe("mobile pairing payload", () => {
	test("accepts compact QR payloads", () => {
		expect(
			normalizePairingPayload({
				v: 1,
				n: "Aidan MacBook",
				h: ["10.0.0.2", "aidan.local"],
				p: 63344,
				u: "pair:abc",
				s: "secret",
				e: "2026-05-25T12:00:00Z",
			}),
		).toEqual({
			protocolVersion: 1,
			desktopName: "Aidan MacBook",
			hosts: ["10.0.0.2", "aidan.local"],
			port: 63344,
			pairingUser: "pair:abc",
			pairingSecret: "secret",
			expiresAt: "2026-05-25T12:00:00Z",
			hostKeyFingerprint: undefined,
		});
	});

	test("keeps verbose payload compatibility", () => {
		const payload = {
			protocolVersion: 1,
			desktopId: "desktop-1",
			desktopName: "Aidan MacBook",
			hosts: ["10.0.0.2"],
			port: 63344,
			pairingUser: "pair:abc",
			pairingSecret: "secret",
			hostKeyFingerprint: "SHA256:test",
			expiresAt: "2026-05-25T12:00:00Z",
		};

		expect(normalizePairingPayload(payload)).toEqual(payload);
	});

	test("moves the successful host to the front for future reconnects", () => {
		expect(
			prioritizeHosts(
				["10.0.0.2", "aidan.local", "10.0.0.2", "  "],
				"aidan.local",
			),
		).toEqual(["aidan.local", "10.0.0.2"]);
	});
});
