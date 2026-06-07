import { describe, expect, test } from "bun:test";
import type { MobileDesktopConnectionState } from "@/features/workspaces/workspace-context-core";
import {
	compactModelLabel,
	composerConnectionBanner,
	formatEffort,
	formatEffortCompact,
} from "./composer-format";

const connected: MobileDesktopConnectionState = {
	status: "connected",
	message: null,
};

describe("mobile composer formatting", () => {
	test("does not show a connection banner when the desktop is connected", () => {
		expect(
			composerConnectionBanner({
				hasActiveDesktop: true,
				connectionState: connected,
				syncStatus: "idle",
				syncError: null,
			}),
		).toBe(null);
	});

	test("shows an offline banner when no desktop is active", () => {
		expect(
			composerConnectionBanner({
				hasActiveDesktop: false,
				connectionState: { status: "idle", message: null },
				syncStatus: "idle",
				syncError: null,
			}),
		).toEqual({
			tone: "error",
			title: "Connection · Offline",
			message: "Connect a desktop to send prompts.",
		});
	});

	test("shows a reconnecting banner for mutation stream reconnects", () => {
		expect(
			composerConnectionBanner({
				hasActiveDesktop: true,
				connectionState: { status: "reconnecting", message: "network" },
				syncStatus: "idle",
				syncError: null,
			}),
		).toEqual({
			tone: "loading",
			title: "Connection · Reconnecting",
			message: "Trying to reconnect to your desktop.",
		});
	});

	test("prioritizes send errors over sync errors", () => {
		expect(
			composerConnectionBanner({
				hasActiveDesktop: true,
				connectionState: connected,
				syncStatus: "error",
				syncError: "sync failed",
				sendError: "send failed",
			}),
		).toEqual({
			tone: "error",
			title: "Connection · Error",
			message: "send failed",
		});
	});

	test("formats model and effort labels", () => {
		expect(compactModelLabel("  GPT-5.5   Medium  ")).toBe("GPT-5.5 Medium");
		expect(compactModelLabel("Claude Opus 4.8 1M")).toBe("Opus 4.8");
		expect(formatEffort("medium")).toBe("Medium");
		expect(formatEffort("xhigh")).toBe("Extra High");
		expect(formatEffortCompact("medium")).toBe("Med");
		expect(formatEffortCompact("xhigh")).toBe("XHigh");
	});
});
