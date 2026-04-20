import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { agentModelSectionsQueryOptions } from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { findModelOption } from "@/lib/workspace-helpers";

/**
 * Invariant: once the model catalog is ready, `settings.defaultModelId` must
 * point to a model that exists in the catalog. If it doesn't (never set, or
 * the previously-picked model is gone), pick a reasonable default and write
 * it back. This is the single place that decides the initial default — every
 * other consumer reads `settings.defaultModelId` directly.
 */
export function useEnsureDefaultModel() {
	const { settings, isLoaded, updateSettings } = useSettings();
	const modelSectionsQuery = useQuery(agentModelSectionsQueryOptions());
	const sections = modelSectionsQuery.data;

	useEffect(() => {
		if (!isLoaded) return;
		if (!sections || sections.length === 0) return;
		const allOptions = sections.flatMap((s) => s.options);
		if (allOptions.length === 0) return;

		// Already valid — nothing to do.
		if (
			settings.defaultModelId &&
			findModelOption(sections, settings.defaultModelId)
		) {
			return;
		}

		// User previously saved a model but it's not in the catalog (yet).
		// Don't overwrite — the catalog may still be partially loaded.
		if (settings.defaultModelId) return;

		// Never been set (null) — pick a sensible initial default.
		const pick =
			sections.find((s) => s.id === "claude")?.options[0]?.id ??
			allOptions[0]?.id ??
			null;
		if (!pick) return;
		updateSettings({ defaultModelId: pick });
	}, [isLoaded, sections, settings.defaultModelId, updateSettings]);
}
