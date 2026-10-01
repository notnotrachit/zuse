import { describe, expect, it } from "vitest";

import {
	assignProjectToGroup,
	createProjectGroup,
	dissolveProjectGroup,
	materializeProjectGroups,
	moveProjectWithinContainer,
	parseProjectGroupLayout,
	projectGroupLayoutsEqual,
	snapshotProjectGroupOrder,
} from "../../../src/lib/project-group-layout";

describe("project group layout", () => {
	it("reads a legacy flat order as ungrouped projects", () => {
		expect(parseProjectGroupLayout(["a", "b", "group:nope"])).toEqual({
			order: ["a", "b"],
			groups: [],
		});
	});

	it("creates a group at the top and nests only its projects", () => {
		const layout = createProjectGroup(
			{ order: ["a", "b"], groups: [] },
			{ id: "work", name: " Work ", projectKeys: ["b"] },
		);
		expect(materializeProjectGroups(["a", "b", "c"], layout)).toEqual([
			{
				kind: "group",
				group: {
					id: "work",
					name: "Work",
					collapsed: false,
					projectKeys: ["b"],
				},
			},
			{ kind: "project", key: "a" },
			{ kind: "project", key: "c" },
		]);
	});

	it("moves a project into and out of a group", () => {
		const created = createProjectGroup(
			{ order: ["a"], groups: [] },
			{ id: "work", name: "Work" },
		);
		const assigned = assignProjectToGroup(created, "a", "work");
		expect(materializeProjectGroups(["a"], assigned)[0]).toMatchObject({
			kind: "group",
			group: { projectKeys: ["a"] },
		});
		const removed = assignProjectToGroup(assigned, "a", null);
		expect(
			materializeProjectGroups(["a"], removed).map((node) => node.kind),
		).toEqual(["group", "project"]);
	});

	it("reorders only inside the same container", () => {
		const layout = snapshotProjectGroupOrder(
			["a", "b"],
			createProjectGroup(
				{ order: ["a", "b"], groups: [] },
				{ id: "work", name: "Work", projectKeys: ["a"] },
			),
		);
		expect(moveProjectWithinContainer(layout, "a", "b")).toBe(layout);
		const both = assignProjectToGroup(
			createProjectGroup(
				{ order: [], groups: [] },
				{ id: "work", name: "Work", projectKeys: ["a", "b"] },
			),
			"b",
			"work",
		);
		// create already inserted a and b; assigning b again is harmless.
		const grouped = createProjectGroup(
			{ order: [], groups: [] },
			{ id: "work", name: "Work", projectKeys: ["a", "b"] },
		);
		const moved = moveProjectWithinContainer(grouped, "b", "a");
		expect(
			moved.groups.find((group) => group.id === "work")?.projectKeys,
		).toEqual(["b", "a"]);
		expect(both.groups[0]?.projectKeys).toEqual(["a", "b"]);
	});

	it("treats a rejected cross-container move as unchanged", () => {
		const layout = createProjectGroup(
			{ order: ["a", "b"], groups: [] },
			{ id: "work", name: "Work", projectKeys: ["a"] },
		);
		expect(
			projectGroupLayoutsEqual(
				layout,
				moveProjectWithinContainer(layout, "a", "b"),
			),
		).toBe(true);
	});

	it("dissolves a group back into the surrounding order", () => {
		const layout = createProjectGroup(
			{ order: ["a", "c"], groups: [] },
			{ id: "work", name: "Work", projectKeys: ["a"] },
		);
		const dissolved = dissolveProjectGroup(layout, "work");
		expect(dissolved.groups).toEqual([]);
		expect(dissolved.order[0]).toBe("a");
	});
});
