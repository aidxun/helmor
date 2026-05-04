import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
	return (
		<SafeAreaView style={styles.screen}>
			<StatusBar style="light" />
			<View style={styles.container}>
				<View style={styles.badge}>
					<Text style={styles.badgeText}>Development Build</Text>
				</View>
				<Text style={styles.title}>Helmor Mobile</Text>
				<Text style={styles.subtitle}>
					Mobile control surface for browsing and arranging Helmor tasks.
				</Text>
				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Ready for LAN pairing</Text>
					<Text style={styles.panelBody}>
						The execution layer stays on the desktop app. This client will call
						the desktop control API once it is added.
					</Text>
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: "#0f1115",
	},
	container: {
		flex: 1,
		justifyContent: "center",
		padding: 24,
	},
	badge: {
		alignSelf: "flex-start",
		borderRadius: 999,
		backgroundColor: "#1f2937",
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	badgeText: {
		color: "#a7f3d0",
		fontSize: 12,
		fontWeight: "600",
	},
	title: {
		marginTop: 18,
		color: "#f9fafb",
		fontSize: 34,
		fontWeight: "700",
		letterSpacing: 0,
	},
	subtitle: {
		marginTop: 10,
		maxWidth: 320,
		color: "#a1a1aa",
		fontSize: 16,
		lineHeight: 23,
	},
	panel: {
		marginTop: 28,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#334155",
		borderRadius: 8,
		backgroundColor: "#171b22",
		padding: 16,
	},
	panelTitle: {
		color: "#f8fafc",
		fontSize: 15,
		fontWeight: "700",
	},
	panelBody: {
		marginTop: 8,
		color: "#a1a1aa",
		fontSize: 14,
		lineHeight: 21,
	},
});
