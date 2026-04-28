import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomProviderSettings } from "@/lib/settings";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

function slugifyProviderName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `custom-${Date.now().toString(36)}`;
}

function makeProvider(): CustomProviderSettings {
	return {
		id: slugifyProviderName(`Custom Provider ${Date.now().toString(36)}`),
		name: "Custom Provider",
		baseUrl: "",
		apiKey: "",
		opusModel: "",
		sonnetModel: "",
		haikuModel: "",
		enabled: true,
	};
}

export function CustomProvidersPanel({
	providers,
	onChange,
}: {
	providers: CustomProviderSettings[];
	onChange: (providers: CustomProviderSettings[]) => void;
}) {
	const updateProvider = (
		index: number,
		patch: Partial<CustomProviderSettings>,
	) => {
		onChange(
			providers.map((provider, itemIndex) =>
				itemIndex === index ? { ...provider, ...patch } : provider,
			),
		);
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="flex justify-end">
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={() => onChange([...providers, makeProvider()])}
				>
					<Plus className="size-3.5" strokeWidth={1.8} />
					Add Provider
				</Button>
			</div>

			{providers.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-[13px] text-muted-foreground">
					No custom providers configured.
				</div>
			) : (
				providers.map((provider, index) => (
					<SettingsGroup
						key={`${provider.id}-${index}`}
						className="rounded-lg border border-border/50 px-4"
					>
						<SettingsRow
							title="Provider name"
							description="Shown as a separate model group."
						>
							<Input
								value={provider.name}
								onChange={(event) => {
									updateProvider(index, { name: event.target.value });
								}}
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow
							title="ANTHROPIC_BASE_URL"
							description="Claude Code compatible endpoint."
						>
							<Input
								value={provider.baseUrl}
								onChange={(event) =>
									updateProvider(index, { baseUrl: event.target.value })
								}
								placeholder="https://api.example.com/anthropic"
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow title="ANTHROPIC_API_KEY">
							<Input
								type="password"
								value={provider.apiKey}
								onChange={(event) =>
									updateProvider(index, { apiKey: event.target.value })
								}
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow
							title="ANTHROPIC_DEFAULT_OPUS_MODEL"
							description="Big model alias. Value can be any provider/model id."
						>
							<Input
								value={provider.opusModel}
								onChange={(event) =>
									updateProvider(index, {
										opusModel: event.target.value,
									})
								}
								placeholder="provider/model"
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow
							title="ANTHROPIC_DEFAULT_SONNET_MODEL"
							description="Default model alias. Value can be any provider/model id."
						>
							<Input
								value={provider.sonnetModel}
								onChange={(event) =>
									updateProvider(index, {
										sonnetModel: event.target.value,
									})
								}
								placeholder="provider/model"
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow
							title="ANTHROPIC_DEFAULT_HAIKU_MODEL"
							description="Small model alias. Value can be any provider/model id."
						>
							<Input
								value={provider.haikuModel}
								onChange={(event) =>
									updateProvider(index, {
										haikuModel: event.target.value,
									})
								}
								placeholder="provider/model"
								className="w-[280px] bg-muted/30 text-[13px]"
							/>
						</SettingsRow>
						<SettingsRow title="Remove provider">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() =>
									onChange(
										providers.filter((_, itemIndex) => itemIndex !== index),
									)
								}
								aria-label="Remove provider"
								className="text-muted-foreground hover:text-destructive"
							>
								<Trash2 className="size-3.5" strokeWidth={1.8} />
							</Button>
						</SettingsRow>
					</SettingsGroup>
				))
			)}
		</div>
	);
}
