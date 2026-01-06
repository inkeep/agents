import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import { RuntimeConfigProvider } from '@/contexts/runtime-config-context';
import { AuthClientProvider } from '@/lib/auth-client';
import {
  DEFAULT_INKEEP_AGENTS_MANAGE_API_URL,
  DEFAULT_INKEEP_AGENTS_RUN_API_URL,
  DEFAULT_NANGO_CONNECT_BASE_URL,
  DEFAULT_NANGO_SERVER_URL,
  DEFAULT_SIGNOZ_URL,
} from '@/lib/runtime-config/defaults';
import type { RuntimeConfig } from '@/lib/runtime-config/types';
import { cn } from '@/lib/utils';
import './globals.css';
import { PostHogProvider } from './providers';

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

const inter = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Inkeep Agents',
  description:
    "Inkeep's multi-agent framework enables multiple specialized AI agents to collaborate and solve complex problems through an agent-based architecture. You can define networks of agents, each with unique instructions, tools, and purposes.",
};

const runtimeConfig: RuntimeConfig = {
  PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET:
    process.env.PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET ||
    process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET,
  PUBLIC_INKEEP_AGENTS_MANAGE_API_URL:
    process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL ||
    process.env.NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL ||
    DEFAULT_INKEEP_AGENTS_MANAGE_API_URL,
  PUBLIC_INKEEP_AGENTS_RUN_API_URL:
    process.env.PUBLIC_INKEEP_AGENTS_RUN_API_URL ||
    process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL ||
    DEFAULT_INKEEP_AGENTS_RUN_API_URL,
  PUBLIC_SIGNOZ_URL:
    process.env.PUBLIC_SIGNOZ_URL || process.env.NEXT_PUBLIC_SIGNOZ_URL || DEFAULT_SIGNOZ_URL,
  PUBLIC_NANGO_SERVER_URL:
    process.env.PUBLIC_NANGO_SERVER_URL ||
    process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
    DEFAULT_NANGO_SERVER_URL,
  PUBLIC_NANGO_CONNECT_BASE_URL:
    process.env.PUBLIC_NANGO_CONNECT_BASE_URL ||
    process.env.NEXT_PUBLIC_NANGO_CONNECT_BASE_URL ||
    DEFAULT_NANGO_CONNECT_BASE_URL,
  PUBLIC_INKEEP_COPILOT_AGENT_ID:
    process.env.PUBLIC_INKEEP_COPILOT_AGENT_ID || process.env.NEXT_PUBLIC_INKEEP_COPILOT_AGENT_ID,
  PUBLIC_INKEEP_COPILOT_PROJECT_ID:
    process.env.PUBLIC_INKEEP_COPILOT_PROJECT_ID ||
    process.env.NEXT_PUBLIC_INKEEP_COPILOT_PROJECT_ID,
  PUBLIC_INKEEP_COPILOT_TENANT_ID:
    process.env.PUBLIC_INKEEP_COPILOT_TENANT_ID || process.env.NEXT_PUBLIC_INKEEP_COPILOT_TENANT_ID,
  PUBLIC_AUTH0_DOMAIN: process.env.PUBLIC_AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN,
  PUBLIC_GOOGLE_CLIENT_ID:
    process.env.PUBLIC_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  PUBLIC_DISABLE_AUTH:
    process.env.PUBLIC_DISABLE_AUTH || process.env.NEXT_PUBLIC_DISABLE_AUTH || 'true',
  PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT:
    process.env.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT ||
    process.env.NEXT_PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT ||
    'false',
  PUBLIC_POSTHOG_KEY: process.env.PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY,
  PUBLIC_POSTHOG_HOST: process.env.PUBLIC_POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST,
  PUBLIC_POSTHOG_SITE_TAG:
    process.env.PUBLIC_POSTHOG_SITE_TAG || process.env.NEXT_PUBLIC_POSTHOG_SITE_TAG,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
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
                    <Toaster />
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
