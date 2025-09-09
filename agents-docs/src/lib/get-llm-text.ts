import type { InferPageType } from "fumadocs-core/source";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { mdxSnippet } from "remark-mdx-snippets";
import { remarkSourceCode } from "remark-source-code";
import type { source } from "@/lib/source";

const processor = remark()
	.use(remarkMdx)
	.use(mdxSnippet)
	.use(remarkSourceCode)
	.use(remarkGfm);

export async function getLLMText(page: InferPageType<typeof source>) {
	const processed = await processor.process({
		path: page.data._file.absolutePath,
		value: page.data.content,
	});

	return `# ${page.data.title}
URL: ${page.url}

${page.data.description}

${processed.value}`;
}
