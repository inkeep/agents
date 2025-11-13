/**
 * Artifact Components for Blog Generator
 *
 * These artifacts capture and store source information throughout the blog creation workflow:
 * - citation: Source material with attribution (created by contentStrategist, used by contentWriter)
 * - scrapedPage: Scraped webpage content (created by urlToMarkdown, used by all downstream agents)
 * - strategicOutline: Outline with evidence mapping (created by contentStrategist, used by contentWriter)
 */

export { citation } from './citation';
export { scrapedPage } from './scraped-page';
export { strategicOutline } from './strategic-outline';
