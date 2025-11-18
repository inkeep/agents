import { artifactComponent } from "@inkeep/agents-sdk";
import { z } from "zod";
import { preview } from "@inkeep/agents-core";

/**
 * Citation artifact component for storing source citations from web search results
 *
 * This artifact captures citations from the Exa web search tool, storing:
 * - Title and URL as preview fields (shown immediately)
 * - Full content and metadata (loaded on-demand)
 *
 * Citation artifacts with 'title' and 'url' preview fields are automatically
 * rendered as interactive cards by Inkeep's widget library.
 */
export const citation = artifactComponent({
  id: "citation",
  name: "citation",
  description: "Source citation from web search results",
  props: z.object({
    title: preview(
      z.string().describe("The title of the source document or webpage")
    ),
    url: preview(z.string().describe("The URL of the source")),
  }),
});
