import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import { useTheme } from 'next-themes';

export interface PrebuiltMCPServer {
  id: string;
  name: string;
  url: string;
  transport: (typeof MCPTransportType)[keyof typeof MCPTransportType];
  imageUrl?: string;
  isOpen?: boolean; // this means MCP server doesn't need a key, so we can quick-create
}

const getBaseMCPServers = (isDark: boolean): PrebuiltMCPServer[] => [
  {
    id: 'apify',
    name: 'Apify',
    url: 'https://mcp.apify.com',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://apify.com/img/apify-logo/logomark-32x32.svg',
  },
  {
    id: 'asana',
    name: 'Asana',
    url: 'https://mcp.asana.com/sse',
    transport: MCPTransportType.sse,
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    url: 'https://mcp.atlassian.com/v1/sse',
    transport: MCPTransportType.sse,
  },
  {
    id: 'buildkite',
    name: 'Buildkite',
    url: 'https://mcp.buildkite.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://buildkite.com/_astro/buildkite-mark.D56ywXpU.svg',
  },
  {
    id: 'canva',
    name: 'Canva',
    url: 'https://mcp.canva.com/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'carbon-voice',
    name: 'Carbon Voice',
    url: 'https://mcp.carbonvoice.app',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://static.wixstatic.com/shapes/e97c23_633874d233a944aea7b424ae16e9efec.svg',
  },
  {
    id: 'close',
    name: 'Close (CRM)',
    url: 'https://mcp.close.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl:
      'https://cdn.prod.website-files.com/61717799a852418a278cfa9b/68793d8479790aec5ed95512_close-logo-color-atom.svg',
  },
  {
    id: 'cloudflare-docs',
    name: 'Cloudflare Docs',
    url: 'https://docs.mcp.cloudflare.com/sse',
    transport: MCPTransportType.sse,
    isOpen: true,
    imageUrl: 'https://www.cloudflare.com/favicon.ico',
  },
  {
    id: 'cloudflare-observability',
    name: 'Cloudflare Observability',
    url: 'https://observability.mcp.cloudflare.com/sse',
    transport: MCPTransportType.sse,
    imageUrl: 'https://www.cloudflare.com/favicon.ico',
  },
  {
    id: 'cloudflare-workers',
    name: 'Cloudflare Workers Bindings',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    transport: MCPTransportType.sse,
    imageUrl: 'https://www.cloudflare.com/favicon.ico',
  },
  {
    id: 'cloudinary',
    name: 'Cloudinary (Asset Management)',
    url: 'https://asset-management.mcp.cloudinary.com/sse',
    transport: MCPTransportType.sse,
    imageUrl: 'https://cloudinary.com/wp-content/uploads/sites/6/2020/09/favicon-32x32-1.png',
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    url: 'https://mcp.deepwiki.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://deepwiki.org/apple-icon.png?a4f658907db0ab87',
    isOpen: true,
  },
  {
    id: 'dodo-payments',
    name: 'Dodo Payments',
    url: 'https://mcp.dodopayments.com/sse',
    transport: MCPTransportType.sse,
    imageUrl:
      'https://docs.dodopayments.com/mintlify-assets/_mintlify/favicons/dodopayments/O4gqzjfBTOvqqqpw/_generated/favicon/favicon-32x32.png',
  },
  {
    id: 'egnyte',
    name: 'Egnyte',
    url: 'https://mcp-server.egnyte.com/sse',
    transport: MCPTransportType.sse,
  },
  {
    id: 'fireflies',
    name: 'Fireflies',
    url: 'https://api.fireflies.ai/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'globalping',
    name: 'Globalping',
    url: 'https://mcp.globalping.dev/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://globalping.io/icons/favicon-32x32.png',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co/mcp?login',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://huggingface.co/front/assets/huggingface_logo-noborder.svg',
  },
  {
    id: 'instant',
    name: 'Instant (InstantDB)',
    url: 'https://mcp.instantdb.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://www.instantdb.com/img/icon/logo-512.svg',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    url: 'https://mcp.intercom.com/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'invideo',
    name: 'Invideo',
    url: 'https://mcp.invideo.io/sse',
    transport: MCPTransportType.sse,
    isOpen: true,
    imageUrl: isDark
      ? 'https://web-assets.invideo.io/favicons/prod/white_favicon.ico'
      : 'https://web-assets.invideo.io/favicons/prod/black_favicon.ico',
  },
  {
    id: 'jam-dev',
    name: 'Jam.dev',
    url: 'https://mcp.jam.dev/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://jam.dev/favicon.ico?cache-bust=2',
  },
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'monday',
    name: 'Monday',
    url: 'https://mcp.monday.com/sse',
    transport: MCPTransportType.sse,
  },
  {
    id: 'needle',
    name: 'Needle',
    url: 'https://mcp.needle-ai.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://needle.app/images/favicon.png',
  },
  {
    id: 'neon',
    name: 'Neon',
    url: 'https://mcp.neon.tech/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://neon.com/favicon/favicon.png',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    url: 'https://netlify-mcp.netlify.app/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://www.netlify.com/favicon/apple-touch-icon.png',
  },
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'octagon-agents',
    name: 'Octagon Agents (Market Intel)',
    url: 'https://mcp.octagonagents.com/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl:
      'https://cdn.prod.website-files.com/67e20964923f8dc825a5dbd0/67e20964923f8dc825a5dc20_favico.png',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    url: 'https://mcp.paypal.com',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'pipeboard-meta-ads',
    name: 'Pipeboard – Meta Ads',
    url: 'https://mcp.pipeboard.co/meta-ads-mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://pipeboard.co/favicon.ico',
  },
  {
    id: 'prisma',
    name: 'Prisma',
    url: 'https://mcp.prisma.io/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://www.prisma.io/docs/img/favicon.png',
  },
  {
    id: 'rube',
    name: 'Rube',
    url: 'https://rube.app/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://rube.app/favicon.ico',
  },
  {
    id: 'semgrep',
    name: 'Semgrep',
    url: 'https://mcp.semgrep.ai/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://semgrep.dev/build/assets/favicon-CIx-xpG_.svg',
    isOpen: true,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'simplescraper',
    name: 'Simplescraper',
    url: 'https://mcp.simplescraper.io/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://simplescraper.io/favicon.ico',
  },
  {
    id: 'square',
    name: 'Square',
    url: 'https://mcp.squareup.com/sse',
    transport: MCPTransportType.sse,
    imageUrl:
      'https://pw-renderer-production-c.squarecdn.com/c94e4b9deb6727292b842f0dc29355f408487bf2/_svelte/favicon.ico',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    url: 'https://mcp.stripe.com',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'stytch',
    name: 'Stytch',
    url: 'https://mcp.stytch.dev/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://stytch.com/favicon.ico',
  },
  {
    id: 'telnyx',
    name: 'Telnyx',
    url: 'https://api.telnyx.com/v2/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://www.telnyx.com/favicon.ico',
  },
  {
    id: 'thoughtspot',
    name: 'ThoughtSpot',
    url: 'https://agent.thoughtspot.app/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl:
      'https://developers.thoughtspot.com/docs/icons/icon-48x48.png?v=3959c799205dc2ce6e1f1d93fd74d630',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    url: 'https://mcp.vercel.com',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'waystation',
    name: 'WayStation',
    url: 'https://waystation.ai/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://waystation.ai/images/logo.svg',
  },
  {
    id: 'webflow',
    name: 'Webflow',
    url: 'https://mcp.webflow.com/sse',
    transport: MCPTransportType.sse,
  },
  {
    id: 'wix',
    name: 'Wix',
    url: 'https://mcp.wix.com/sse',
    transport: MCPTransportType.sse,
    imageUrl: 'https://wix.com/favicon.ico',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    transport: MCPTransportType.streamableHttp,
  },
  {
    id: 'zine',
    name: 'Zine',
    url: 'https://www.zine.ai/mcp',
    transport: MCPTransportType.streamableHttp,
    imageUrl: 'https://www.zine.ai/_next/image?url=%2Fimages%2Fzine-logo.png&w=64&q=75',
  },
];

// Custom hook to get theme-aware MCP servers
export function usePrebuiltMCPServers(): PrebuiltMCPServer[] {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return getBaseMCPServers(isDark);
}
