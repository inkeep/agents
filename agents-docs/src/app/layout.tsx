import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import type { Organization, WebSite, WithContext } from 'schema-dts';
import { InkeepScript } from '@/components/inkeep/inkeep-script';
import { Navbar } from '@/components/navbar';
import { JsonLd } from '@/components/seo/json-ld';
import { AppSidebar } from '@/components/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
});

const orgLd: WithContext<Organization> = {
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
    'https://x.com/inkeep_ai',
    'https://www.linkedin.com/company/inkeep',
    'https://github.com/inkeep',
    'https://www.crunchbase.com/organization/inkeep',
    'https://www.youtube.com/@inkeep-ai',
  ],
};

const siteLd: WithContext<WebSite> = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Inkeep Open Source',
  url: 'https://docs.inkeep.com',
  alternateName: 'Inkeep Docs',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <JsonLd json={[orgLd, siteLd]} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <InkeepScript />
          <RootProvider theme={{ enabled: false }}>
            <SidebarProvider>
              <Navbar />
              <main
                id="nd-docs-layout"
                className={cn(
                  'flex flex-1 flex-col pt-[calc(var(--fd-nav-height)-0.4rem)] transition-[padding] fd-default-layout',
                  'mx-(--fd-layout-offset)',
                  'md:[&_#nd-page_article]:pt-0! xl:[--fd-toc-width:286px] xl:[&_#nd-page_article]:px-8',
                  'md:[--fd-sidebar-width:268px] lg:[--fd-sidebar-width:286px]',
                  'flex flex-1 flex-row pe-(--fd-layout-offset) max-w-fd-container relative top-[calc(var(--fd-nav-height)+1rem)] px-4 ms-auto! me-auto!'
                )}
              >
                <AppSidebar />
                {children}
              </main>
            </SidebarProvider>
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
