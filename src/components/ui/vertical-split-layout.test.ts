import { describe, expect, it } from "vitest";
import {
	clampVerticalSplitSizes,
	closeVerticalSplitPanel,
	getInitialVerticalSplitSizes,
	getPrimaryPanelSize,
	openVerticalSplitPanel,
	resizeVerticalSplitPanel,
	type VerticalSplitPanelConfig,
} from "./vertical-split-layout";

const panels: VerticalSplitPanelConfig[] = [
	{ id: "changes", open: true, minSize: 96, defaultSize: 240 },
	{ id: "actions", open: true, minSize: 72, defaultSize: 160 },
	{ id: "terminal", open: false, minSize: 96, defaultSize: 180 },
];

const baseConfig = {
	containerSize: 600,
	headerSize: 33,
	minPrimarySize: 96,
	primaryPanelId: "changes",
	panels,
	sizes: {
		actions: 160,
		terminal: 180,
	},
};

describe("vertical split layout", () => {
	it("initializes panel sizes from defaults", () => {
		expect(getInitialVerticalSplitSizes(panels)).toEqual({
			changes: 240,
			actions: 160,
			terminal: 180,
		});
	});

	it("derives the primary panel size from remaining body capacity", () => {
		expect(getPrimaryPanelSize(baseConfig)).toBe(341);
	});

	it("moves the actions divider up by shrinking the primary and growing actions", () => {
		const next = resizeVerticalSplitPanel({
			...baseConfig,
			deltaY: -80,
			panelId: "actions",
		});

		expect(next).toEqual({
			actions: 240,
			terminal: 180,
		});
	});

	it("stops moving the actions divider up when the primary reaches its minimum", () => {
		const next = resizeVerticalSplitPanel({
			...baseConfig,
			deltaY: -500,
			panelId: "actions",
		});

		expect(next).toEqual({
			actions: 405,
			terminal: 180,
		});
		expect(
			getPrimaryPanelSize({
				...baseConfig,
				sizes: next,
			}),
		).toBe(96);
	});

	it("moves the actions divider down by shrinking actions before terminal", () => {
		const openPanels = panels.map((panel) =>
			panel.id === "terminal" ? { ...panel, open: true } : panel,
		);
		const next = resizeVerticalSplitPanel({
			...baseConfig,
			panels: openPanels,
			deltaY: 300,
			panelId: "actions",
		});

		expect(next).toEqual({
			actions: 72,
			terminal: 96,
		});
	});

	it("moves the terminal divider down by shrinking terminal and growing actions", () => {
		const openPanels = panels.map((panel) =>
			panel.id === "terminal" ? { ...panel, open: true } : panel,
		);
		const next = resizeVerticalSplitPanel({
			...baseConfig,
			panels: openPanels,
			deltaY: 60,
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 220,
			terminal: 120,
		});
	});

	it("moves the terminal divider up by shrinking actions then primary", () => {
		const openPanels = panels.map((panel) =>
			panel.id === "terminal" ? { ...panel, open: true } : panel,
		);
		const next = resizeVerticalSplitPanel({
			...baseConfig,
			panels: openPanels,
			deltaY: -300,
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 72,
			terminal: 333,
		});
		expect(
			getPrimaryPanelSize({
				...baseConfig,
				panels: openPanels,
				sizes: next,
			}),
		).toBe(96);
	});

	it("opens a secondary panel to fill available space", () => {
		const next = openVerticalSplitPanel({
			...baseConfig,
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 72,
			terminal: 333,
		});
	});

	it("compresses open secondary panels to minimum when opening another panel", () => {
		const next = openVerticalSplitPanel({
			...baseConfig,
			sizes: {
				actions: 405,
				terminal: 180,
			},
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 72,
			terminal: 333,
		});
		expect(
			getPrimaryPanelSize({
				...baseConfig,
				panels: panels.map((panel) =>
					panel.id === "terminal" ? { ...panel, open: true } : panel,
				),
				sizes: next,
			}),
		).toBe(96);
	});

	it("transfers a closed lower panel's space to the open panel above it", () => {
		const openPanels = panels.map((panel) =>
			panel.id === "terminal" ? { ...panel, open: true } : panel,
		);
		const next = closeVerticalSplitPanel({
			...baseConfig,
			panels: openPanels,
			sizes: {
				actions: 160,
				terminal: 180,
			},
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 340,
			terminal: 180,
		});
	});

	it("lets the primary panel absorb closed space when no open secondary panel is above", () => {
		const actionsClosedPanels = panels.map((panel) =>
			panel.id === "actions" ? { ...panel, open: false } : panel,
		);
		const next = closeVerticalSplitPanel({
			...baseConfig,
			panels: actionsClosedPanels.map((panel) =>
				panel.id === "terminal" ? { ...panel, open: true } : panel,
			),
			sizes: {
				actions: 160,
				terminal: 180,
			},
			panelId: "terminal",
		});

		expect(next).toEqual({
			actions: 160,
			terminal: 180,
		});
	});

	it("clamps open panels on container resize without overflowing the primary minimum", () => {
		const openPanels = panels.map((panel) =>
			panel.id === "terminal" ? { ...panel, open: true } : panel,
		);
		const next = clampVerticalSplitSizes({
			...baseConfig,
			containerSize: 420,
			panels: openPanels,
			sizes: {
				actions: 240,
				terminal: 220,
			},
		});

		expect(next).toEqual({
			actions: 129,
			terminal: 96,
		});
		expect(
			getPrimaryPanelSize({
				...baseConfig,
				containerSize: 420,
				panels: openPanels,
				sizes: next,
			}),
		).toBe(96);
	});
});
