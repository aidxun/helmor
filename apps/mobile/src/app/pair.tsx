import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, XCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useWorkspaces } from "@/features/workspaces";
import {
	decodePairingPayload,
	normalizePairingPayload,
	pairDesktop,
} from "@/lib/remote";

type PairState =
	| { status: "pairing" }
	| { status: "done"; desktopName: string }
	| { status: "error" };

export default function PairScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{ p?: string; payload?: string }>();
	const { reloadDesktopConnections } = useWorkspaces();
	const [state, setState] = useState<PairState>({ status: "pairing" });

	useEffect(() => {
		let cancelled = false;
		const addDetail = (message: string) => {
			console.info(`[mobile-pairing] ${message}`);
		};
		async function run() {
			try {
				const encodedPayload = params.p ?? params.payload;
				if (!encodedPayload) {
					throw new Error("Missing pairing payload");
				}
				addDetail("Deep link opened");
				const payload = normalizePairingPayload(
					decodePairingPayload<unknown>(encodedPayload),
				);
				addDetail(`Decoded ${payload.desktopName}: ${payload.host}`);
				await pairDesktop(payload, addDetail);
				await reloadDesktopConnections();
				if (cancelled) return;
				setState({
					status: "done",
					desktopName: payload.desktopName,
				});
				setTimeout(() => {
					if (!cancelled) router.replace("/");
				}, 700);
			} catch (error) {
				if (cancelled) return;
				console.warn("[mobile-pairing] failed", error);
				setState({ status: "error" });
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [params.p, params.payload, reloadDesktopConnections, router]);

	const copy = getPairScreenCopy(state);

	return (
		<View className="flex-1 items-center justify-center gap-5 bg-background px-8">
			<View className="w-full max-w-[360px] items-center gap-6 rounded-[28px] border border-border/40 bg-card px-6 py-8">
				<View
					className={
						state.status === "error"
							? "h-24 w-24 items-center justify-center rounded-full bg-destructive/10"
							: "h-24 w-24 items-center justify-center rounded-full bg-muted"
					}
				>
					{state.status === "pairing" ? (
						<ActivityIndicator size="large" colorClassName="tint-foreground" />
					) : (
						<Icon
							icon={state.status === "done" ? CheckCircle2 : XCircle}
							className={
								state.status === "error"
									? "h-12 w-12 text-destructive"
									: "h-12 w-12 text-foreground"
							}
						/>
					)}
				</View>
				<View className="gap-2">
					<Text className="text-center text-[24px] font-semibold text-foreground">
						{copy.title}
					</Text>
					<Text className="text-center text-[16px] leading-6 text-muted-foreground">
						{copy.description}
					</Text>
				</View>
			</View>
			{state.status === "error" ? (
				<Pressable
					onPress={() => router.replace("/")}
					className="rounded-full bg-foreground px-5 py-3 active:opacity-70"
				>
					<Text className="font-semibold text-background">Back to Helmor</Text>
				</Pressable>
			) : null}
		</View>
	);
}

function getPairScreenCopy(state: PairState) {
	if (state.status === "done") {
		return {
			title: "Desktop connected",
			description: `${state.desktopName} is ready to use from your phone.`,
		};
	}

	if (state.status === "error") {
		return {
			title: "Connection failed",
			description:
				"Make sure Helmor Desktop is open and Mobile Companion is enabled.",
		};
	}

	return {
		title: "Connecting to desktop",
		description:
			"Verifying the Cloudflare companion link. This usually takes a moment.",
	};
}
