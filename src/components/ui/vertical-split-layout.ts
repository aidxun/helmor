export type VerticalSplitPanelId = string;

export type VerticalSplitPanelConfig = {
	id: VerticalSplitPanelId;
	open: boolean;
	minSize: number;
	defaultSize: number;
};

export type VerticalSplitPanelSizeState = Record<VerticalSplitPanelId, number>;

export type VerticalSplitLayoutConfig = {
	containerSize: number;
	headerSize: number;
	minPrimarySize: number;
	primaryPanelId: VerticalSplitPanelId;
	panels: VerticalSplitPanelConfig[];
	sizes: VerticalSplitPanelSizeState;
};

function getBodyCapacity({
	containerSize,
	headerSize,
	panels,
}: Pick<VerticalSplitLayoutConfig, "containerSize" | "headerSize" | "panels">) {
	return Math.max(0, containerSize - headerSize * panels.length);
}

function getPanelSize(
	panel: VerticalSplitPanelConfig,
	sizes: VerticalSplitPanelSizeState,
) {
	return sizes[panel.id] ?? panel.defaultSize;
}

export function getInitialVerticalSplitSizes(
	panels: VerticalSplitPanelConfig[],
): VerticalSplitPanelSizeState {
	return Object.fromEntries(
		panels.map((panel) => [panel.id, panel.defaultSize]),
	);
}

export function getPrimaryPanelSize({
	containerSize,
	headerSize,
	minPrimarySize,
	primaryPanelId,
	panels,
	sizes,
}: VerticalSplitLayoutConfig): number {
	const bodyCapacity = getBodyCapacity({ containerSize, headerSize, panels });
	const openSecondarySize = panels
		.filter((panel) => panel.id !== primaryPanelId && panel.open)
		.reduce((total, panel) => total + getPanelSize(panel, sizes), 0);

	return Math.max(minPrimarySize, bodyCapacity - openSecondarySize);
}

export function resizeVerticalSplitPanel({
	panelId,
	deltaY,
	...config
}: VerticalSplitLayoutConfig & {
	panelId: VerticalSplitPanelId;
	deltaY: number;
}): VerticalSplitPanelSizeState {
	const dividerIndex = config.panels.findIndex((item) => item.id === panelId);
	if (dividerIndex <= 0 || deltaY === 0) return config.sizes;

	const primarySize = getPrimaryPanelSize(config);
	const nextSizes = { ...config.sizes };
	const openUpperPanels = config.panels
		.slice(0, dividerIndex)
		.filter((item) => item.open);
	const openLowerPanels = config.panels
		.slice(dividerIndex)
		.filter((item) => item.open);
	const donors = deltaY < 0 ? [...openUpperPanels].reverse() : openLowerPanels;
	const recipients =
		deltaY < 0 ? openLowerPanels : [...openUpperPanels].reverse();

	let remaining = Math.abs(deltaY);
	let released = 0;
	const getSize = (panel: VerticalSplitPanelConfig) =>
		panel.id === config.primaryPanelId
			? primarySize
			: getPanelSize(panel, nextSizes);
	const getMinSize = (panel: VerticalSplitPanelConfig) =>
		panel.id === config.primaryPanelId ? config.minPrimarySize : panel.minSize;

	for (const donor of donors) {
		if (remaining <= 0) break;
		const available = Math.max(0, getSize(donor) - getMinSize(donor));
		const reduction = Math.min(available, remaining);
		if (reduction <= 0) continue;
		if (donor.id !== config.primaryPanelId) {
			nextSizes[donor.id] = getSize(donor) - reduction;
		}
		released += reduction;
		remaining -= reduction;
	}

	const recipient = recipients[0];
	if (recipient && released > 0 && recipient.id !== config.primaryPanelId) {
		nextSizes[recipient.id] = getSize(recipient) + released;
	}

	return nextSizes;
}

export function clampVerticalSplitSizes({
	...config
}: VerticalSplitLayoutConfig): VerticalSplitPanelSizeState {
	const bodyCapacity = getBodyCapacity(config);
	const bodyBudget = Math.max(0, bodyCapacity - config.minPrimarySize);
	const openSecondaryPanels = config.panels.filter(
		(item) => item.id !== config.primaryPanelId && item.open,
	);
	const nextSizes = { ...config.sizes };

	for (const item of openSecondaryPanels) {
		nextSizes[item.id] = Math.max(item.minSize, getPanelSize(item, nextSizes));
	}

	let overflow =
		openSecondaryPanels.reduce(
			(total, item) => total + getPanelSize(item, nextSizes),
			0,
		) - bodyBudget;

	for (let index = openSecondaryPanels.length - 1; index >= 0; index -= 1) {
		if (overflow <= 0) break;
		const item = openSecondaryPanels[index];
		if (!item) continue;
		const currentSize = getPanelSize(item, nextSizes);
		const reduction = Math.min(overflow, currentSize - item.minSize);
		nextSizes[item.id] = currentSize - reduction;
		overflow -= reduction;
	}

	return nextSizes;
}

export function openVerticalSplitPanel({
	panelId,
	...config
}: Omit<VerticalSplitLayoutConfig, "panels"> & {
	panelId: VerticalSplitPanelId;
	panels: VerticalSplitPanelConfig[];
}): VerticalSplitPanelSizeState {
	if (panelId === config.primaryPanelId) return config.sizes;

	const panel = config.panels.find((item) => item.id === panelId);
	if (!panel) return config.sizes;

	const bodyCapacity = getBodyCapacity(config);
	const bodyBudget = Math.max(0, bodyCapacity - config.minPrimarySize);
	const otherOpenSecondaryPanels = config.panels.filter(
		(item) =>
			item.id !== config.primaryPanelId && item.id !== panelId && item.open,
	);
	const otherMinSize = otherOpenSecondaryPanels.reduce(
		(total, item) => total + item.minSize,
		0,
	);
	const maxSize = Math.max(panel.minSize, bodyBudget - otherMinSize);
	const nextSizes = {
		...config.sizes,
		[panelId]: maxSize,
	};

	for (const item of otherOpenSecondaryPanels) {
		nextSizes[item.id] = item.minSize;
	}

	return nextSizes;
}

export function closeVerticalSplitPanel({
	panelId,
	...config
}: VerticalSplitLayoutConfig & {
	panelId: VerticalSplitPanelId;
}): VerticalSplitPanelSizeState {
	if (panelId === config.primaryPanelId) return config.sizes;

	const panelIndex = config.panels.findIndex((item) => item.id === panelId);
	const panel = config.panels[panelIndex];
	if (!panel?.open) return config.sizes;

	let previousOpenSecondaryPanel: VerticalSplitPanelConfig | undefined;
	for (let index = panelIndex - 1; index >= 0; index -= 1) {
		const item = config.panels[index];
		if (item && item.id !== config.primaryPanelId && item.open) {
			previousOpenSecondaryPanel = item;
			break;
		}
	}

	if (!previousOpenSecondaryPanel) return config.sizes;

	return {
		...config.sizes,
		[previousOpenSecondaryPanel.id]:
			getPanelSize(previousOpenSecondaryPanel, config.sizes) +
			getPanelSize(panel, config.sizes),
	};
}
