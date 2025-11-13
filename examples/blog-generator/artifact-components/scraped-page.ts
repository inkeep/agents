import { preview } from '@inkeep/agents-core';
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const scrapedPage = artifactComponent({
  id: 'scraped_page',
  name: 'scraped_page',
  description: `Complete Firecrawl scraping result with all metadata and content`,
  props: z.object({}),
});
