import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomProviderSettings } from "@/lib/settings";
import { SettingsGroup, SettingsRow } from "../components/settings-row";

function slugifyProviderName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `custom-${Date.now().toString(36)}`;
}

function makeProvider(index: number): CustomProviderSettings {
	const name = `Custom Provider ${index}`;
	return {
		id: slugifyProviderName(`${name}-${Date.now().toString(36)}`),
		name,
		baseUrl: "",
		apiKey: "",
		models: [],
		enabled: true,
	};
}

function parseModelList(value: string): string[] {
	return Array.from(
		new Set(
			value
				.split(/[\n,]+/)
				.map((model) => model.trim())
				.filter(Boolean),
		),
	);
}

export function CustomProvidersPanel({
	providers,
	onChange,
}: {
	providers: CustomProviderSettings[];
	onChange: (providers: CustomProviderSettings[]) => void;
}) {
	const [openProviderId, setOpenProviderId] = useState<string | null>(null);

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

	const addProvider = () => {
		const provider = makeProvider(providers.length + 1);
		onChange([...providers, provider]);
		setOpenProviderId(provider.id);
	};

	return (
		<SettingsGroup>
			{providers.map((provider, index) => {
				const isOpen = openProviderId === provider.id;
				return (
					<Collapsible
						key={`${provider.id}-${index}`}
						open={isOpen}
						onOpenChange={(next) =>
							setOpenProviderId(next ? provider.id : null)
						}
					>
						<div>
							<div className="flex items-center gap-3 py-5">
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-4 text-left"
									>
										<div className="min-w-0">
											<div className="truncate text-[13px] font-medium text-foreground">
												{provider.name.trim() || "Untitled provider"}
											</div>
											<div className="mt-0.5 truncate text-[12px] text-muted-foreground">
												{provider.baseUrl.trim() || "No base URL configured"}
											</div>
										</div>
										<ChevronDown
											className={`size-4 shrink-0 text-muted-foreground transition-transform ${
												isOpen ? "rotate-180" : ""
											}`}
											strokeWidth={1.8}
										/>
									</button>
								</CollapsibleTrigger>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => {
										onChange(
											providers.filter((_, itemIndex) => itemIndex !== index),
										);
										if (openProviderId === provider.id) {
											setOpenProviderId(null);
										}
									}}
									aria-label="Remove provider"
									className="shrink-0 text-muted-foreground hover:text-destructive"
								>
									<Trash2 className="size-3.5" strokeWidth={1.8} />
								</Button>
							</div>
							<CollapsibleContent>
								<SettingsGroup className="border-border/40 border-t">
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
												updateProvider(index, {
													baseUrl: event.target.value,
												})
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
												updateProvider(index, {
													apiKey: event.target.value,
												})
											}
											className="w-[280px] bg-muted/30 text-[13px]"
										/>
									</SettingsRow>
									<SettingsRow
										title="Models"
										description="One model id per line. Helmor maps the selected model to Claude Code env at send time."
										align="start"
									>
										<Textarea
											value={provider.models.join("\n")}
											onChange={(event) =>
												updateProvider(index, {
													models: parseModelList(event.target.value),
												})
											}
											placeholder={"xiaomi/mimo-v2.5\nxiaomi/mimo-v2-flash"}
											className="min-h-[96px] w-[280px] resize-y bg-muted/30 font-mono text-[12px]"
										/>
									</SettingsRow>
								</SettingsGroup>
							</CollapsibleContent>
						</div>
					</Collapsible>
				);
			})}
			<button
				type="button"
				onClick={addProvider}
				className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left transition-colors hover:text-foreground"
			>
				<div className="min-w-0">
					<div className="text-[13px] font-medium leading-snug text-foreground">
						Add custom provider
					</div>
					<div className="mt-1 text-[12px] leading-snug text-muted-foreground">
						Create a provider with base URL, API key, and model ids.
					</div>
				</div>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
					<Plus className="size-3.5" strokeWidth={1.8} />
				</span>
			</button>
		</SettingsGroup>
	);
}
