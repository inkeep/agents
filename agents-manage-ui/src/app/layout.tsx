import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { connection } from 'next/server';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import { INKEEP_BRAND_COLOR } from '@/constants/theme';
import { AuthClientProvider } from '@/contexts/auth-client';
import { PostHogProvider } from '@/contexts/posthog';
import { RuntimeConfigProvider } from '@/contexts/runtime-config';
import {
  DEFAULT_INKEEP_AGENTS_API_URL,
  DEFAULT_NANGO_CONNECT_BASE_URL,
  DEFAULT_NANGO_SERVER_URL,
  DEFAULT_SIGNOZ_URL,
} from '@/lib/runtime-config/defaults';
import type { RuntimeConfig } from '@/lib/runtime-config/types';
import { cn } from '@/lib/utils';
import './globals.css';

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

const APP_NAME = 'Inkeep Agents';

const inter = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Inkeep's multi-agent framework enables multiple specialized AI agents to collaborate and solve complex problems through an agent-based architecture. You can define networks of agents, each with unique instructions, tools, and purposes.",
  keywords: ['agents', 'ai', 'framework', 'sdk', 'inkeep'],
  generator: 'Next.js',
  applicationName: APP_NAME,
  appleWebApp: {
    title: APP_NAME,
  },
  other: {
    'msapplication-TileColor': INKEEP_BRAND_COLOR,
  },
  twitter: {
    creator: process.env.METADATA_TWITTER_CREATOR || '@inkeep',
    site: process.env.METADATA_TWITTER_SITE || 'https://inkeep.com',
  },
  ...(process.env.METADATA_BASE_URL && {
    metadataBase: new URL(process.env.METADATA_BASE_URL),
    openGraph: {
      // https://github.com/vercel/next.js/discussions/50189#discussioncomment-10826632
      url: './',
      siteName: APP_NAME,
      locale: 'en_US',
      type: 'website',
    },
    alternates: {
      // https://github.com/vercel/next.js/discussions/50189#discussioncomment-10826632
      canonical: './',
    },
  }),
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  await connection();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          inter.variable,
          jetBrainsMono.variable,
          'bg-background has-data-[slot=sidebar-wrapper]:bg-sidebar',
          'antialiased text-foreground'
        )}
        // Suppress hydration warnings in development caused by browser extensions
        suppressHydrationWarning={process.env.NODE_ENV !== 'production'}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            <RuntimeConfigProvider value={runtimeConfig}>
              <PostHogProvider>
                <QueryProvider>
                  <AuthClientProvider>
                    {children}
                    <Toaster closeButton />
                  </AuthClientProvider>
                </QueryProvider>
              </PostHogProvider>
            </RuntimeConfigProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
