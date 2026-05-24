export type MockChat = {
	id: string;
	title: string;
	daysAgo: number;
	starred: boolean;
};

export const MOCK_CHATS: MockChat[] = [
	{ id: "1", title: "Helmor mobile app skeleton", daysAgo: 5, starred: false },
	{
		id: "2",
		title: "Workspace session timeline review",
		daysAgo: 5,
		starred: false,
	},
	{
		id: "3",
		title: "Development build signing notes",
		daysAgo: 7,
		starred: false,
	},
	{ id: "4", title: "Agent streaming UI polish", daysAgo: 7, starred: true },
	{ id: "5", title: "Local workspace onboarding", daysAgo: 7, starred: false },
	{
		id: "6",
		title: "Expo development client setup",
		daysAgo: 14,
		starred: false,
	},
	{
		id: "7",
		title: "Codex session summary surface",
		daysAgo: 14,
		starred: true,
	},
	{
		id: "8",
		title: "Mobile drawer gesture behavior",
		daysAgo: 14,
		starred: false,
	},
	{
		id: "10",
		title: "Parallel workspace status checks",
		daysAgo: 14,
		starred: false,
	},
	{
		id: "11",
		title: "Helmor theme token mapping",
		daysAgo: 21,
		starred: false,
	},
	{
		id: "12",
		title: "Structuring messages and timelines",
		daysAgo: 28,
		starred: false,
	},
	{
		id: "13",
		title: "Session attachment workflow",
		daysAgo: 28,
		starred: false,
	},
	{
		id: "14",
		title: "Expo navigation patterns",
		daysAgo: 30,
		starred: false,
	},
	{
		id: "15",
		title: "Debugging Expo CLI on device",
		daysAgo: 35,
		starred: false,
	},
];
