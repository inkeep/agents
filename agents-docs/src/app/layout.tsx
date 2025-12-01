import { Inter } from 'next/font/google';
import type { Organization, WebSite, WithContext } from 'schema-dts';
import { JsonLd } from '@/components/seo/json-ld';
import { createMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';
import { Provider } from '@/components/provider';
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
    'https://www.linkedin.com/company/inkeep',
    'https://github.com/inkeep',
    'https://www.crunchbase.com/organization/inkeep',
    'https://www.youtube.com/@inkeep-ai',
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
  title: siteLd.name,
  description: orgLd.description,
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cn(inter.className, 'antialiased')} suppressHydrationWarning>
      <body
        className="flex flex-col min-h-screen"
        // Suppress hydration warnings in development caused by browser extensions
        suppressHydrationWarning={process.env.NODE_ENV !== 'production'}
      >
        <JsonLd json={[orgLd, siteLd]} />
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
