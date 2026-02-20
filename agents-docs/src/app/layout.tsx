import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { LinkItemType } from 'fumadocs-ui/layouts/shared';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Rocket } from 'lucide-react';
import { Inter } from 'next/font/google';
import { Suspense, ViewTransition } from 'react';
import { FaGithub, FaLinkedinIn, FaSlack, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import type { Organization, WebSite, WithContext } from 'schema-dts';
import PostHogPageview from '@/app/posthog-pageview';
import { GithubStars } from '@/components/github-stars';
import { Logo } from '@/components/logo';
import { SearchDialog } from '@/components/search-dialog';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { PostHogProvider } from '@/lib/analytics/posthog-provider';
import { SLACK_URL } from '@/lib/constants';
import { createMetadata } from '@/lib/metadata';
import { source } from '@/lib/source';
import { cn } from '@/lib/utils';
import '@/app/global.css';

const inter = Inter({
  subsets: ['latin'],
});

const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Inkeep',
  url: 'https://inkeep.com',
  logo: 'https://inkeep.com/images/logos/logo-with-text-black.svg',
  description:
    'Ship Agent-powered assistants and automations that boost customer experience and 10x your teams. Build with a No-Code Visual Builder or Developer Framework with full 2-way sync.',
  // description: "Ship AI Agents that get real work done. The only platform that empowers developers and non-developers to create and manage intelligent agents for customer support, sales, and more.",
  foundingDate: '2023',
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      url: 'https://inkeep.com/get-started',
    },
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: 'https://inkeep.com/get-started',
    },
  ],
  sameAs: [
    'https://x.com/inkeep',
    'https://linkedin.com/company/inkeep',
    'https://github.com/inkeep',
    'https://crunchbase.com/organization/inkeep',
    'https://youtube.com/@inkeep-ai',
  ],
} satisfies WithContext<Organization>;

const siteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Inkeep Open Source',
  url: 'https://docs.inkeep.com',
  alternateName: 'Inkeep Docs',
} satisfies WithContext<WebSite>;

export const metadata = createMetadata({
  title: {
    default: siteLd.name,
    template: '%s - Inkeep Open Source Docs',
  },
  description: orgLd.description,
});

const linkItems: LinkItemType[] = [
  {
    type: 'icon',
    url: 'https://github.com/inkeep/agents',
    icon: <FaGithub />,
    text: 'GitHub',
  },
  {
    type: 'icon',
    url: SLACK_URL,
    icon: <FaSlack />,
    text: 'Slack',
  },
  {
    type: 'icon',
    url: 'https://linkedin.com/company/inkeep/',
    icon: <FaLinkedinIn />,
    text: 'LinkedIn',
  },
  {
    type: 'icon',
    url: 'https://twitter.com/inkeep',
    icon: <FaXTwitter />,
    text: 'X (Twitter)',
  },
  {
    type: 'icon',
    url: 'https://youtube.com/@inkeep-ai',
    icon: <FaYoutube />,
    text: 'Inkeep on YouTube',
  },
];

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cn(inter.className, 'antialiased')} suppressHydrationWarning>
      <body
        className="flex flex-col min-h-screen bg-background"
        // Suppress hydration warnings in development caused by browser extensions
        suppressHydrationWarning={process.env.NODE_ENV !== 'production'}
      >
        <JsonLd json={[orgLd, siteLd]} />
        <Suspense>
          <PostHogPageview />
        </Suspense>
        <PostHogProvider>
          <RootProvider search={{ SearchDialog }}>
            <DocsLayout
              tree={source.pageTree}
              nav={{
                title: <Logo className="!w-[110px] !h-[32px]" />,
              }}
              sidebar={{
                className: 'bg-background',
                banner: (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="grow text-primary border-primary/30 hover:bg-primary/5 dark:bg-primary/5 hover:text-primary dark:text-primary dark:border-primary/30 dark:hover:bg-primary/10"
                      asChild
                    >
                      <a
                        href="https://inkeep.com/demo?cta_id=docs_nav"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Rocket />
                        Get Demo
                      </a>
                    </Button>
                    <GithubStars />
                  </div>
                ),
              }}
              links={linkItems}
            >
              <ViewTransition>{children}</ViewTransition>
            </DocsLayout>
          </RootProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
