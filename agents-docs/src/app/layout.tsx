import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { InkeepScript } from '@/components/inkeep/inkeep-script';
import { Navbar } from '@/components/navbar';
import { AppSidebar } from '@/components/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: { children: ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Inkeep Agents',
    url: 'https://docs.inkeep.com',
    alternateName: 'Inkeep',
  };

  return (
    <html lang="en" className={`${inter.className} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
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
                  'flex flex-1 flex-row pe-(--fd-layout-offset) max-w-fd-container relative top-[calc(var(--fd-nav-height)+1rem)] px-4 ms-auto! me-auto!',
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
