import { describe, expect, it } from "vitest";

import {
	collectOpencode2Inventory,
	filterOpencode2PrimaryAgents,
	isUsableOpencode2Model,
} from "../../../src/drivers/opencode2.ts";

describe("OpenCode 2 model inventory", () => {
	it("keeps active tool-capable models and drops the rest", () => {
		expect(
			isUsableOpencode2Model({
				id: "gpt-5.4",
				name: "GPT-5.4",
				status: "active",
				enabled: true,
				capabilities: { tools: true },
			}),
		).toBe(true);
		expect(
			isUsableOpencode2Model({
				id: "tts",
				name: "TTS",
				status: "active",
				enabled: true,
				capabilities: { tools: false },
			}),
		).toBe(false);
		expect(
			isUsableOpencode2Model({
				id: "old",
				name: "Old",
				status: "deprecated",
				enabled: true,
				capabilities: { tools: true },
			}),
		).toBe(false);
	});

	it("omits hidden internal agents and keeps plan/build", () => {
		expect(
			filterOpencode2PrimaryAgents([
				{
					id: "build",
					name: "Build",
					mode: "primary",
					hidden: false,
					description: "Build",
				},
				{
					id: "plan",
					name: "Plan",
					mode: "primary",
					hidden: false,
					description: null,
				},
				{
					id: "compaction",
					name: "Compaction",
					mode: "primary",
					hidden: true,
				},
				{ id: "explore", name: "Explore", mode: "subagent", hidden: false },
			]),
		).toEqual([
			{ name: "build", mode: "primary", description: "Build" },
			{ name: "plan", mode: "primary" },
		]);
	});

	it("groups connected models as provider/model slugs with variants", () => {
		const inventory = collectOpencode2Inventory(
			[
				{
					id: "openrouter",
					name: "OpenRouter",
					connections: [{ type: "credential", id: "cred_1" }],
					methods: [{ type: "key" }],
				},
				{
					id: "anthropic",
					name: "Anthropic",
					connections: [],
					methods: [{ type: "env", names: ["ANTHROPIC_API_KEY"] }],
				},
			],
			[{ id: "openrouter", name: "OpenRouter", activation: "auto" }],
			[
				{
					id: "sakana/fugu-max",
					providerID: "openrouter",
					name: "Fugu Max",
					status: "active",
					enabled: true,
					capabilities: { tools: true },
					variants: [{ id: "high" }, { id: "max" }],
				},
				{
					id: "claude-sonnet-4",
					providerID: "anthropic",
					name: "Sonnet",
					status: "active",
					enabled: true,
					capabilities: { tools: true },
					variants: [],
				},
			],
			[{ id: "build", name: "Build", mode: "primary", hidden: false }],
			new Set(),
		);
		expect(inventory.providers[0]?.id).toBe("openrouter");
		expect(inventory.providers[0]?.connected).toBe(true);
		expect(inventory.providers[0]?.models).toEqual([
			{
				id: "openrouter/sakana/fugu-max",
				label: "Fugu Max",
				variants: ["high", "max"],
			},
		]);
		const anthropic = inventory.providers.find((p) => p.id === "anthropic");
		expect(anthropic?.connected).toBe(false);
		expect(anthropic?.models).toEqual([]);
		expect(anthropic?.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
	});
});
