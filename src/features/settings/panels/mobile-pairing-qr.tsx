import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function MobilePairingQr({
	value,
	size = 208,
}: {
	value: string;
	size?: number;
}) {
	const [svg, setSvg] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setSvg(null);
		void buildQrSvg(value).then((nextSvg) => {
			if (!cancelled) {
				setSvg(nextSvg);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [value]);

	if (!svg) {
		return (
			<div
				aria-label="Generating mobile pairing QR code"
				className="block"
				role="img"
				style={{ height: size, width: size }}
			/>
		);
	}

	return (
		<div
			aria-label="Mobile pairing QR code"
			className="block [&_svg]:block"
			role="img"
			style={{ height: size, width: size }}
			// qrcode generates an SVG from the local pairing URL; no user HTML is accepted here.
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}

function buildQrSvg(value: string): Promise<string> {
	return QRCode.toString(value, {
		color: {
			dark: "#000000ff",
			light: "#ffffffff",
		},
		errorCorrectionLevel: "L",
		margin: 3,
		type: "svg",
	});
}
