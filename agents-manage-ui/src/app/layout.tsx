import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { AppSidebarProvider } from '@/components/sidebar-nav/app-sidebar-provider';
import { SidebarInset } from '@/components/ui/sidebar';
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
import './globals.css';

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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  // DEBUG: Log environment variables on server side
  console.log('=== SERVER SIDE ENVIRONMENT (layout.tsx) ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL:', process.env.VERCEL);
  console.log('PUBLIC_INKEEP_AGENTS_MANAGE_API_URL:', process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL);
  console.log('NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL:', process.env.NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL);
  console.log('INKEEP_AGENTS_MANAGE_API_URL:', process.env.INKEEP_AGENTS_MANAGE_API_URL);
  console.log('All env keys containing INKEEP:', Object.keys(process.env).filter(k => k.includes('INKEEP')));
  console.log('===========================================');

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
    PUBLIC_AUTH0_DOMAIN: process.env.PUBLIC_AUTH0_DOMAIN,
    PUBLIC_GOOGLE_CLIENT_ID: process.env.PUBLIC_GOOGLE_CLIENT_ID,
  };

  console.log('RuntimeConfig created:', JSON.stringify(runtimeConfig, null, 2));

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
              <AppSidebarProvider>
                <SidebarInset>{children}</SidebarInset>
              </AppSidebarProvider>
              <Toaster />
            </RuntimeConfigProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
