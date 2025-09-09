import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppSidebar } from "@/components/sidebar-nav/sidebar-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

const jetBrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
});

const inter = Inter({
	display: "swap",
	subsets: ["latin"],
	variable: "--font-inter",
});

export const metadata: Metadata = {
	title: "Inkeep Agents",
	description:
		"Inkeep's multi-agent framework enables multiple specialized AI agents to collaborate and solve complex problems through a graph-based architecture. You can define networks of agents, each with unique instructions, tools, and purposes.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${inter.variable} ${jetBrainsMono.variable} antialiased`}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<NuqsAdapter>
						<SidebarProvider
							style={
								{
									"--sidebar-width": "calc(var(--spacing) * 62)",
									"--header-height": "calc(var(--spacing) * 12)",
								} as React.CSSProperties
							}
						>
							<AppSidebar variant="inset" />
							<SidebarInset>{children}</SidebarInset>
						</SidebarProvider>
						<Toaster />
					</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
