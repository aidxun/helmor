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
	type ByoCloudflareConfig,
	type CompanionPairingPayload,
	type CompanionStatus,
	createCompanionPairing,
	disableCompanion,
	enableCompanion,
	forgetCompanionTunnel,
	getCompanionStatus,
	provisionByoCloudflare,
	provisionHelmorManagedCompanion,
	revokeCompanionDevice,
	saveByoCloudflareConfig,
	validateByoCloudflareConfig,
} from "@/lib/api";
import { extractError } from "@/lib/errors";
import {
	SettingsGroup,
	SettingsNotice,
	SettingsRow,
} from "../components/settings-row";
import { MobilePairingQr } from "./mobile-pairing-qr";

const EMPTY_BYO_CONFIG: ByoCloudflareConfig = {
	accountId: "",
	zoneId: "",
	apiToken: "",
	hostname: "",
};

type StatusMessage = {
	tone: "info" | "ok" | "warn" | "error";
	text: string;
};

export function MobileAccessPanel() {
	const [status, setStatus] = useState<CompanionStatus | null>(null);
	const [pairing, setPairing] = useState<CompanionPairingPayload | null>(null);
	const [byoConfig, setByoConfig] =
		useState<ByoCloudflareConfig>(EMPTY_BYO_CONFIG);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<StatusMessage | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [didCopyPairingUrl, setDidCopyPairingUrl] = useState(false);
	const [didCopyWebUrl, setDidCopyWebUrl] = useState(false);
	const isByoConfigComplete = isCompleteByoConfig(byoConfig);

	const refresh = useCallback(async () => {
		setStatus(await getCompanionStatus());
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
	const pairingWebUrl = useMemo(() => {
		if (!pairing) return null;
		const host = normalizeCompanionHost(pairing.host);
		return `${host}/mobile/#p=${encodeURIComponent(
			base64UrlEncode(JSON.stringify(compactPairingPayload(pairing))),
		)}`;
	}, [pairing]);

	useEffect(() => {
		setDidCopyPairingUrl(false);
		setDidCopyWebUrl(false);
	}, [pairingUrl]);

	async function runBusy(action: () => Promise<void>) {
		setIsBusy(true);
		setError(null);
		setMessage(null);
		try {
			await action();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setIsBusy(false);
		}
	}

	return (
		<SettingsGroup>
			<SettingsRow
				title="Mobile Companion"
				description={
					status?.hostname
						? `Public URL: ${status.hostname}`
						: "Allocate a Cloudflare hostname before pairing a phone."
				}
				align="start"
			>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						onClick={() =>
							void runBusy(async () => {
								setStatus(await enableCompanion());
							})
						}
						disabled={isBusy}
					>
						Enable
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							void runBusy(async () => {
								await disableCompanion();
								setPairing(null);
								await refresh();
							})
						}
						disabled={isBusy || !status?.serverRunning}
					>
						Disable
					</Button>
				</div>
			</SettingsRow>

			{error ? (
				<SettingsRow title="Status">
					<SettingsNotice tone="error">{error}</SettingsNotice>
				</SettingsRow>
			) : null}
			{message ? (
				<SettingsRow title="Status">
					<SettingsNotice tone={message.tone}>{message.text}</SettingsNotice>
				</SettingsRow>
			) : null}

			<SettingsRow
				title="Helmor-managed Cloudflare"
				description="Uses Helmor's hosted companion registry when it is configured. Use Bring Your Own Cloudflare for a personal domain."
			>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() =>
						void runBusy(async () => {
							setStatus(await provisionHelmorManagedCompanion());
						})
					}
					disabled={isBusy}
				>
					Allocate URL
				</Button>
			</SettingsRow>

			<SettingsRow
				title="Bring Your Own Cloudflare"
				description="Creates a Cloudflare Tunnel and a proxied DNS record for a hostname in your own zone."
				align="start"
			>
				<div className="flex w-[340px] flex-col gap-2">
					<CompanionInput
						placeholder="Account ID"
						value={byoConfig.accountId}
						onChange={(accountId) =>
							setByoConfig((current) => ({ ...current, accountId }))
						}
					/>
					<CompanionInput
						placeholder="Zone ID"
						value={byoConfig.zoneId}
						onChange={(zoneId) =>
							setByoConfig((current) => ({ ...current, zoneId }))
						}
					/>
					<CompanionInput
						placeholder="API token"
						type="password"
						value={byoConfig.apiToken}
						onChange={(apiToken) =>
							setByoConfig((current) => ({ ...current, apiToken }))
						}
					/>
					<CompanionInput
						placeholder="mobile.originspark.cloud"
						value={byoConfig.hostname}
						onChange={(hostname) =>
							setByoConfig((current) => ({ ...current, hostname }))
						}
					/>
					<p className="text-nano leading-snug text-muted-foreground">
						Save config only checks the fields locally. Create tunnel calls
						Cloudflare, writes DNS, starts the local server, and runs
						cloudflared.
					</p>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() =>
								void runBusy(async () => {
									await validateByoCloudflareConfig(byoConfig);
									await saveByoCloudflareConfig(byoConfig);
									setMessage({
										tone: "ok",
										text: "Cloudflare settings saved locally. Use Create tunnel to allocate the public URL.",
									});
									await refresh();
								})
							}
							disabled={isBusy || !isByoConfigComplete}
						>
							Save config
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={() =>
								void runBusy(async () => {
									setStatus(await provisionByoCloudflare(byoConfig));
									setMessage({
										tone: "ok",
										text: `Cloudflare tunnel is ready at ${byoConfig.hostname}.`,
									});
								})
							}
							disabled={isBusy || !isByoConfigComplete}
						>
							Create tunnel
						</Button>
					</div>
				</div>
			</SettingsRow>

			<SettingsRow
				title="Pair phone"
				description={
					status?.hostname
						? "Scan this QR code with Helmor Mobile."
						: "Allocate a Cloudflare URL first."
				}
				align="start"
			>
				<div className="flex flex-col items-end gap-2">
					<Button
						type="button"
						size="sm"
						onClick={() =>
							void runBusy(async () => {
								setPairing(await createCompanionPairing());
								await refresh();
							})
						}
						disabled={isBusy || !status?.hostname}
					>
						Show QR
					</Button>
					{pairing && pairingUrl && pairingWebUrl ? (
						<div className="grid grid-cols-2 gap-3">
							<PairingQrCard
								label="Mobile app"
								value={pairingUrl}
								copied={didCopyPairingUrl}
								onCopy={() =>
									void handleCopyPairingUrl(pairingUrl, setDidCopyPairingUrl)
								}
							/>
							<PairingQrCard
								label="Mobile web"
								value={pairingWebUrl}
								copied={didCopyWebUrl}
								onCopy={() =>
									void handleCopyPairingUrl(pairingWebUrl, setDidCopyWebUrl)
								}
							/>
						</div>
					) : null}
				</div>
			</SettingsRow>

			<SettingsRow
				title="Runtime"
				description={
					status?.serverRunning
						? `Server 127.0.0.1:${status.serverPort}; tunnel ${
								status.tunnelRunning ? "running" : "not running"
							}`
						: "Server not running"
				}
			>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() =>
						void runBusy(async () => {
							setStatus(await forgetCompanionTunnel());
							setPairing(null);
						})
					}
					disabled={isBusy || !status?.hostname}
				>
					Forget URL
				</Button>
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
				<div className="flex min-w-[260px] flex-col gap-2">
					{status?.pairedDevices.map((device) => (
						<div
							key={device.id}
							className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2"
						>
							<div className="min-w-0">
								<div className="truncate text-small font-medium text-foreground">
									{device.label}
								</div>
								<div className="truncate text-nano text-muted-foreground">
									{device.revokedAt
										? `Revoked ${formatDate(device.revokedAt)}`
										: device.lastSeenAt
											? `Last seen ${formatDate(device.lastSeenAt)}`
											: `Paired ${formatDate(device.createdAt)}`}
								</div>
							</div>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() =>
									void runBusy(async () => {
										await revokeCompanionDevice(device.id);
										await refresh();
									})
								}
								disabled={isBusy || Boolean(device.revokedAt)}
							>
								Revoke
							</Button>
						</div>
					))}
				</div>
			</SettingsRow>
		</SettingsGroup>
	);

	async function handleCopyPairingUrl(
		pairingUrl: string,
		setCopied: (copied: boolean) => void,
	) {
		setError(null);
		try {
			await navigator.clipboard.writeText(pairingUrl);
			setCopied(true);
		} catch (err) {
			setError(errorMessage(err));
		}
	}
}

function PairingQrCard({
	label,
	value,
	copied,
	onCopy,
}: {
	label: string;
	value: string;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<div className="flex flex-col items-center gap-2">
			<div className="text-nano font-medium text-muted-foreground">{label}</div>
			<div className="rounded-lg bg-white p-3">
				<QrCodeBoundary resetKey={value}>
					<MobilePairingQr value={value} size={184} />
				</QrCodeBoundary>
			</div>
			<Button type="button" size="sm" variant="ghost" onClick={onCopy}>
				{copied ? "Copied" : "Copy link"}
			</Button>
		</div>
	);
}

function CompanionInput({
	value,
	onChange,
	placeholder,
	type = "text",
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	type?: "text" | "password";
}) {
	return (
		<input
			className="h-8 rounded-md border border-border bg-background px-2 text-small text-foreground outline-none focus:border-ring"
			placeholder={placeholder}
			type={type}
			value={value}
			onChange={(event) => onChange(event.currentTarget.value)}
		/>
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

function compactPairingPayload(pairing: CompanionPairingPayload) {
	return {
		v: pairing.v,
		h: pairing.host,
		p: pairing.pat,
		d: pairing.desktopId,
		n: pairing.desktopName,
		i: pairing.deviceId,
		s: pairing.stable,
	};
}

function normalizeCompanionHost(host: string): string {
	const trimmed = host.trim().replace(/\/+$/, "");
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return `https://${trimmed}`;
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
	return extractError(error, "Mobile companion action failed").message;
}

function isCompleteByoConfig(config: ByoCloudflareConfig): boolean {
	return Boolean(
		config.accountId.trim() &&
			config.zoneId.trim() &&
			config.apiToken.trim() &&
			config.hostname.trim(),
	);
}
