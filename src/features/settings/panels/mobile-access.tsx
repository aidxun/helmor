import {
	Component,
	type ErrorInfo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	createMobilePairing,
	getMobileAccessStatus,
	type MobileAccessStatus,
	type MobilePairingPayload,
	revokeMobileDevice,
	stopMobileAccessServer,
} from "@/lib/api";
import {
	SettingsGroup,
	SettingsNotice,
	SettingsRow,
} from "../components/settings-row";
import { MobilePairingQr } from "./mobile-pairing-qr";

export function MobileAccessPanel() {
	const [status, setStatus] = useState<MobileAccessStatus | null>(null);
	const [pairing, setPairing] = useState<MobilePairingPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [didCopyPairingUrl, setDidCopyPairingUrl] = useState(false);

	const refresh = useCallback(async () => {
		setStatus(await getMobileAccessStatus());
	}, []);

	useEffect(() => {
		void refresh().catch((err) => setError(errorMessage(err)));
	}, [refresh]);

	const pairingUrl = useMemo(() => {
		if (!pairing) return null;
		return `helmor:///pair?p=${encodeURIComponent(
			base64UrlEncode(JSON.stringify(compactPairingPayload(pairing))),
		)}`;
	}, [pairing]);

	useEffect(() => {
		setDidCopyPairingUrl(false);
	}, [pairingUrl]);

	async function handleCreatePairing() {
		setIsBusy(true);
		setError(null);
		try {
			const next = await createMobilePairing();
			setPairing(next);
			await refresh();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setIsBusy(false);
		}
	}

	async function handleStop() {
		setIsBusy(true);
		setError(null);
		try {
			await stopMobileAccessServer();
			setPairing(null);
			await refresh();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setIsBusy(false);
		}
	}

	async function handleRevoke(deviceId: string) {
		setIsBusy(true);
		setError(null);
		try {
			await revokeMobileDevice(deviceId);
			await refresh();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setIsBusy(false);
		}
	}

	async function handleCopyPairingUrl() {
		if (!pairingUrl) return;
		setError(null);
		try {
			await navigator.clipboard.writeText(pairingUrl);
			setDidCopyPairingUrl(true);
		} catch (err) {
			setError(errorMessage(err));
		}
	}

	return (
		<SettingsGroup>
			<SettingsRow
				title="Mobile pairing"
				description="Show a QR code that opens Helmor Mobile and pairs this desktop over the local network."
				align="start"
			>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						onClick={handleCreatePairing}
						disabled={isBusy}
					>
						Show QR
					</Button>
					{status?.running ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleStop}
							disabled={isBusy}
						>
							Stop
						</Button>
					) : null}
				</div>
			</SettingsRow>

			{error ? (
				<SettingsRow title="Status">
					<SettingsNotice tone="error">{error}</SettingsNotice>
				</SettingsRow>
			) : null}

			{pairing && pairingUrl ? (
				<SettingsRow
					title="Scan with iPhone camera"
					description={
						<>
							Expires {formatDate(pairing.expiresAt)}. Host{" "}
							{pairing.hosts[0] ?? "unknown"}:{pairing.port}
						</>
					}
					align="start"
				>
					<div className="flex flex-col items-end gap-2">
						<div className="rounded-lg bg-white p-3">
							<QrCodeBoundary resetKey={pairingUrl}>
								<MobilePairingQr value={pairingUrl} size={208} />
							</QrCodeBoundary>
						</div>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => void handleCopyPairingUrl()}
						>
							{didCopyPairingUrl ? "Copied" : "Copy link"}
						</Button>
					</div>
				</SettingsRow>
			) : null}

			<SettingsRow
				title="Server"
				description={
					status?.running
						? `Listening on ${status.hosts.join(", ")}:${status.port}`
						: "Not running"
				}
			>
				<span className="text-small text-muted-foreground">
					{status?.hostKeyFingerprint ?? "No host key"}
				</span>
			</SettingsRow>

			<SettingsRow
				title="Paired devices"
				description={
					status?.pairedDevices.length
						? `${status.pairedDevices.length} device(s) can connect.`
						: "No paired devices yet."
				}
				align="start"
			>
				<div className="flex min-w-[220px] flex-col gap-2">
					{status?.pairedDevices.map((device) => (
						<div
							key={device.deviceId}
							className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2"
						>
							<div className="min-w-0">
								<div className="truncate text-small font-medium text-foreground">
									{device.deviceName}
								</div>
								<div className="truncate text-nano text-muted-foreground">
									{device.lastSeenAt
										? `Last seen ${formatDate(device.lastSeenAt)}`
										: `Paired ${formatDate(device.createdAt)}`}
								</div>
							</div>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => void handleRevoke(device.deviceId)}
								disabled={isBusy}
							>
								Revoke
							</Button>
						</div>
					))}
				</div>
			</SettingsRow>
		</SettingsGroup>
	);
}

type QrCodeBoundaryProps = {
	resetKey: string;
	children: ReactNode;
};

type QrCodeBoundaryState = {
	error: string | null;
};

class QrCodeBoundary extends Component<
	QrCodeBoundaryProps,
	QrCodeBoundaryState
> {
	state: QrCodeBoundaryState = { error: null };

	static getDerivedStateFromError(error: unknown): QrCodeBoundaryState {
		return { error: errorMessage(error) };
	}

	componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
		console.error("Failed to render mobile pairing QR", error, errorInfo);
	}

	componentDidUpdate(prevProps: QrCodeBoundaryProps) {
		if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
			this.setState({ error: null });
		}
	}

	render() {
		if (this.state.error) {
			return (
				<SettingsNotice tone="error" className="mt-0 max-w-[208px]">
					QR failed to render: {this.state.error}
				</SettingsNotice>
			);
		}

		return this.props.children;
	}
}

function base64UrlEncode(value: string): string {
	const bytes =
		typeof TextEncoder === "undefined"
			? utf8Bytes(value)
			: new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function compactPairingPayload(pairing: MobilePairingPayload) {
	return {
		v: pairing.protocolVersion,
		n: pairing.desktopName,
		h: pairing.hosts,
		p: pairing.port,
		u: pairing.pairingUser,
		s: pairing.pairingSecret,
		e: pairing.expiresAt,
	};
}

function utf8Bytes(value: string): number[] {
	const bytes: number[] = [];
	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (codePoint === undefined) continue;
		if (codePoint <= 0x7f) {
			bytes.push(codePoint);
		} else if (codePoint <= 0x7ff) {
			bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
		} else if (codePoint <= 0xffff) {
			bytes.push(
				0xe0 | (codePoint >> 12),
				0x80 | ((codePoint >> 6) & 0x3f),
				0x80 | (codePoint & 0x3f),
			);
		} else {
			bytes.push(
				0xf0 | (codePoint >> 18),
				0x80 | ((codePoint >> 12) & 0x3f),
				0x80 | ((codePoint >> 6) & 0x3f),
				0x80 | (codePoint & 0x3f),
			);
		}
	}
	return bytes;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return value;
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
