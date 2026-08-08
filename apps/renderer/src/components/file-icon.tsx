import { Folder, FolderOpen } from "lucide-react";
import {
	createFileTreeIconResolver,
	getBuiltInSpriteSheet,
} from "@pierre/trees";
import { useInsertionEffect } from "react";

type Props = {
	readonly name: string;
	readonly kind: "file" | "directory";
	readonly expanded?: boolean;
	readonly className?: string;
};

export type ResolvedFileIcon = {
	readonly name: string;
	readonly token?: string;
	readonly viewBox?: string;
};

const FILE_ICON_SPRITE_ID = "fz-file-icon-sprite";
const fileIconResolver = createFileTreeIconResolver("complete");
const fileIconSprite = getBuiltInSpriteSheet("complete");

const TOKEN_TONES: Readonly<Record<string, string>> = {
	astro: "purple",
	babel: "yellow",
	bash: "green",
	biome: "blue",
	bootstrap: "indigo",
	browserslist: "yellow",
	bun: "mauve",
	c: "blue",
	claude: "orange",
	cpp: "blue",
	css: "indigo",
	database: "purple",
	docker: "blue",
	eslint: "indigo",
	git: "vermilion",
	go: "cyan",
	graphql: "pink",
	html: "orange",
	image: "pink",
	javascript: "yellow",
	json: "orange",
	markdown: "green",
	mcp: "teal",
	nextjs: "gray",
	npm: "red",
	oxc: "cyan",
	postcss: "red",
	prettier: "teal",
	python: "blue",
	react: "cyan",
	ruby: "red",
	rust: "orange",
	sass: "pink",
	stylelint: "indigo",
	svelte: "red",
	svg: "orange",
	svgo: "green",
	swift: "orange",
	table: "green",
	tailwind: "cyan",
	terraform: "indigo",
	text: "gray",
	typescript: "blue",
	vite: "purple",
	vscode: "blue",
	vue: "green",
	wasm: "indigo",
	webpack: "blue",
	yml: "red",
	zig: "orange",
	zip: "yellow",
};

const installFileIconSprite = () => {
	if (
		typeof document === "undefined" ||
		document.getElementById(FILE_ICON_SPRITE_ID) !== null
	) {
		return;
	}
	const sprite = document.createElement("div");
	sprite.id = FILE_ICON_SPRITE_ID;
	sprite.setAttribute("aria-hidden", "true");
	sprite.style.display = "none";
	sprite.innerHTML = fileIconSprite;
	document.body.prepend(sprite);
};

export const resolveFileIcon = (name: string): ResolvedFileIcon =>
	fileIconResolver.resolveIcon("file-tree-icon-file", name);

const SVG_NS = "http://www.w3.org/2000/svg";

/** Vanilla-DOM folder glyph for non-React hosts (CodeMirror chips). */
const svgFromFolder = (expanded: boolean): SVGSVGElement => {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	// Lucide folder / folder-open paths
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute(
		"d",
		expanded
			? "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
			: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	);
	svg.appendChild(path);
	return svg;
};

/**
 * Vanilla-DOM equivalent of `FileIcon` for non-React hosts (the CodeMirror
 * chip widget). Same pierre sprite + tone for files, same Lucide folder
 * glyphs as the file tree for directories.
 */
export const buildFileIconDom = (
	name: string,
	kind: "file" | "directory",
	className = "",
): Element => {
	installFileIconSprite();
	if (kind === "directory") {
		const svg = svgFromFolder(false);
		if (className !== "") svg.setAttribute("class", className);
		svg.style.opacity = "0.7";
		return svg;
	}
	const icon = resolveFileIcon(name);
	const tone = TOKEN_TONES[icon.token ?? ""] ?? "gray";
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", icon.viewBox ?? "0 0 16 16");
	svg.setAttribute("aria-hidden", "true");
	if (className !== "") svg.setAttribute("class", className);
	svg.style.color = `var(--file-icon-${tone})`;
	const use = document.createElementNS(SVG_NS, "use");
	use.setAttribute("href", `#${icon.name}`);
	svg.appendChild(use);
	return svg;
};

/** Uses the same file-type resolver and glyph set as the structured file tree. */
export function FileIcon({ name, kind, expanded = false, className }: Props) {
	useInsertionEffect(installFileIconSprite, []);

	const wrapperClass =
		className ?? "inline-flex size-3.5 shrink-0 items-center justify-center";
	if (kind === "directory") {
		return (
			<span className={wrapperClass} aria-hidden="true">
				{expanded ? <FolderOpen className="size-full opacity-70" /> : <Folder className="size-full opacity-70" />}
			</span>
		);
	}

	const icon = resolveFileIcon(name);
	const tone = TOKEN_TONES[icon.token ?? ""] ?? "gray";
	return (
		<span className={wrapperClass} aria-hidden="true">
			<svg
				aria-hidden="true"
				className="size-full"
				viewBox={icon.viewBox ?? "0 0 16 16"}
				data-file-icon-token={icon.token}
				style={{ color: `var(--file-icon-${tone})` }}
			>
				<use href={`#${icon.name}`} />
			</svg>
		</span>
	);
}
