import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	eslint: {
		// Disable ESLint during builds on Vercel to avoid deployment failures
		ignoreDuringBuilds: true,
	},
	images: {
		// Allow all external image domains since users can provide any URL
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
			{
				protocol: "http",
				hostname: "**",
			},
		],
	},
};

export default nextConfig;
