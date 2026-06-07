import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Camera, Image as ImageIcon } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";

type ImageSource = "camera" | "library";

export default function AddImagesSheet() {
	const router = useRouter();
	const [pendingSource, setPendingSource] = useState<ImageSource | null>(null);
	const busy = pendingSource !== null;

	const pickImage = async (source: ImageSource) => {
		if (busy) return;
		setPendingSource(source);
		try {
			const result =
				source === "camera" ? await openCamera() : await openPhotoLibrary();
			if (!result.canceled && result.assets.length > 0) {
				router.back();
			}
		} finally {
			setPendingSource(null);
		}
	};

	return (
		<ScrollView
			className="flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="android:pb-safe pb-6"
		>
			<AndroidGrabber />
			<View className="px-5 pb-4 pt-2">
				<Text className="text-[28px] font-bold text-foreground">Add image</Text>
				<Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
					Attach an image to the next Helmor prompt.
				</Text>
			</View>

			<View className="gap-3 px-5">
				<ImageAction
					icon={Camera}
					label="Take photo"
					description="Use the camera"
					loading={pendingSource === "camera"}
					disabled={busy}
					onPress={() => void pickImage("camera")}
				/>
				<ImageAction
					icon={ImageIcon}
					label="Choose from library"
					description="Pick an existing image"
					loading={pendingSource === "library"}
					disabled={busy}
					onPress={() => void pickImage("library")}
				/>
			</View>
		</ScrollView>
	);
}

function ImageAction({
	icon,
	label,
	description,
	loading,
	disabled,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	description: string;
	loading: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			className="flex-row items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 active:opacity-70"
		>
			<View className="h-11 w-11 items-center justify-center rounded-xl bg-background">
				<Icon icon={icon} className="h-5 w-5 text-foreground" />
			</View>
			<View className="flex-1">
				<Text className="text-[16px] font-semibold text-foreground">
					{label}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{description}
				</Text>
			</View>
			{loading ? (
				<ActivityIndicator size="small" colorClassName="tint-foreground" />
			) : null}
		</Pressable>
	);
}

async function openCamera() {
	const permission = await ImagePicker.requestCameraPermissionsAsync();
	if (!permission.granted) return { canceled: true, assets: [] };
	return ImagePicker.launchCameraAsync({
		mediaTypes: ["images"],
		quality: 0.9,
	});
}

async function openPhotoLibrary() {
	const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
	if (!permission.granted) return { canceled: true, assets: [] };
	return ImagePicker.launchImageLibraryAsync({
		mediaTypes: ["images"],
		allowsMultipleSelection: true,
		quality: 0.9,
	});
}
