import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

const SETTINGS_KEY = "helmor.mobile.settings.v1";

export type MobileThemeMode = "system" | "light" | "dark";

export type MobileSettings = {
	themeMode: MobileThemeMode;
	hapticsEnabled: boolean;
};

type MobileSettingsContextValue = {
	settings: MobileSettings;
	loaded: boolean;
	updateSettings: (patch: Partial<MobileSettings>) => Promise<void>;
	impact: (style?: Haptics.ImpactFeedbackStyle) => Promise<void>;
	notify: (type?: Haptics.NotificationFeedbackType) => Promise<void>;
};

const DEFAULT_SETTINGS: MobileSettings = {
	themeMode: "system",
	hapticsEnabled: true,
};

const MobileSettingsContext = createContext<MobileSettingsContextValue | null>(
	null,
);

export function MobileSettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<MobileSettings>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let canceled = false;
		void (async () => {
			const stored = await loadMobileSettings();
			if (!canceled) {
				setSettings(stored);
				setLoaded(true);
			}
		})();
		return () => {
			canceled = true;
		};
	}, []);

	const updateSettings = useCallback(
		async (patch: Partial<MobileSettings>) => {
			const next = normalizeSettings({ ...settings, ...patch });
			setSettings(next);
			await saveMobileSettings(next);
		},
		[settings],
	);

	const impact = useCallback(
		async (style = Haptics.ImpactFeedbackStyle.Light) => {
			if (!settings.hapticsEnabled) return;
			await Haptics.impactAsync(style);
		},
		[settings.hapticsEnabled],
	);

	const notify = useCallback(
		async (type = Haptics.NotificationFeedbackType.Success) => {
			if (!settings.hapticsEnabled) return;
			await Haptics.notificationAsync(type);
		},
		[settings.hapticsEnabled],
	);

	const value = useMemo(
		() => ({
			settings,
			loaded,
			updateSettings,
			impact,
			notify,
		}),
		[impact, loaded, notify, settings, updateSettings],
	);

	return (
		<MobileSettingsContext.Provider value={value}>
			{children}
		</MobileSettingsContext.Provider>
	);
}

export function useMobileSettings() {
	const context = use(MobileSettingsContext);
	if (!context) {
		throw new Error(
			"useMobileSettings must be used within MobileSettingsProvider",
		);
	}
	return context;
}

async function loadMobileSettings(): Promise<MobileSettings> {
	const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
	if (!raw) return DEFAULT_SETTINGS;
	try {
		return normalizeSettings(JSON.parse(raw) as Partial<MobileSettings>);
	} catch {
		return DEFAULT_SETTINGS;
	}
}

async function saveMobileSettings(settings: MobileSettings): Promise<void> {
	await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings), {
		keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
	});
}

function normalizeSettings(value: Partial<MobileSettings>): MobileSettings {
	return {
		themeMode:
			value.themeMode === "light" ||
			value.themeMode === "dark" ||
			value.themeMode === "system"
				? value.themeMode
				: DEFAULT_SETTINGS.themeMode,
		hapticsEnabled:
			typeof value.hapticsEnabled === "boolean"
				? value.hapticsEnabled
				: DEFAULT_SETTINGS.hapticsEnabled,
	};
}
