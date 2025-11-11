import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AppSidebar } from '@/components/sidebar-nav/sidebar-nav';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { RuntimeConfigProvider } from '@/contexts/runtime-config-context';
import {
  DEFAULT_INKEEP_AGENTS_MANAGE_API_URL,
  DEFAULT_INKEEP_AGENTS_RUN_API_URL,
  DEFAULT_NANGO_CONNECT_BASE_URL,
  DEFAULT_NANGO_SERVER_URL,
  DEFAULT_SIGNOZ_URL,
} from '@/lib/runtime-config/defaults';
import type { RuntimeConfig } from '@/lib/runtime-config/types';
import { cn } from '@/lib/utils';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeConfig: RuntimeConfig = {
    PUBLIC_INKEEP_AGENTS_MANAGE_API_URL:
      process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL || DEFAULT_INKEEP_AGENTS_MANAGE_API_URL,
    PUBLIC_INKEEP_AGENTS_RUN_API_URL:
      process.env.PUBLIC_INKEEP_AGENTS_RUN_API_URL || DEFAULT_INKEEP_AGENTS_RUN_API_URL,
    PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET:
      process.env.PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET,
    PUBLIC_SIGNOZ_URL: process.env.PUBLIC_SIGNOZ_URL || DEFAULT_SIGNOZ_URL,
    PUBLIC_NANGO_SERVER_URL: process.env.PUBLIC_NANGO_SERVER_URL || DEFAULT_NANGO_SERVER_URL,
    PUBLIC_NANGO_CONNECT_BASE_URL:
      process.env.PUBLIC_NANGO_CONNECT_BASE_URL || DEFAULT_NANGO_CONNECT_BASE_URL,
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(inter.variable, jetBrainsMono.variable, 'antialiased')}
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
              <SidebarProvider
                style={{
                  '--sidebar-width': 'calc(var(--spacing) * 62)',
                  '--header-height': 'calc(var(--spacing) * 12)',
                }}
              >
                <AppSidebar variant="inset" />
                <SidebarInset>{children}</SidebarInset>
              </SidebarProvider>
              <Toaster />
            </RuntimeConfigProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
