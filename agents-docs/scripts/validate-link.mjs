import path from "node:path";
import { getTableOfContents } from "fumadocs-core/server";
import { getSlugs, parseFilePath } from "fumadocs-core/source";
import {
	printErrors,
	readFiles,
	scanURLs,
	validateFiles,
} from "next-validate-link";

async function checkLinks() {
	const docsFiles = await readFiles("content/docs/**/*.{md,mdx}");

	// Build valid URLs manually from the slugs
	const validUrls = {};

	docsFiles.forEach((file) => {
		const info = parseFilePath(path.relative("content/docs", file.path));
		const slugs = getSlugs(info);
		const url = `/${slugs.join("/")}`;
		validUrls[url] = true;

		const hashes = getTableOfContents(file.content).map((item) =>
			item.url.slice(1),
		);
		hashes.forEach((hash) => {
			if (hash) {
				validUrls[`${url}#${hash}`] = true;
			}
		});
	});

	const scanned = await scanURLs({
		populate: {
			"[[...slug]]": docsFiles.map((file) => {
				const info = parseFilePath(path.relative("content/docs", file.path));
				return {
					value: getSlugs(info),
					hashes: getTableOfContents(file.content).map((item) =>
						item.url.slice(1),
					),
				};
			}),
		},
	});

	// Merge our manually built URLs with the scanned ones
	if (scanned.urls) {
		Object.assign(scanned.urls, validUrls);
	} else {
		scanned.urls = validUrls;
	}

	const standardErrors = await validateFiles([...docsFiles], {
		scanned,
		strict: true,
	});

	printErrors(standardErrors, true);
}

void checkLinks();
