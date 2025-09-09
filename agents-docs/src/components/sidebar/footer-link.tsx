"use client";

import { icon } from "@inkeep/docskit";
import Link from "fumadocs-core/link";
import { Button } from "@/components/ui/button";

interface FooterLinkProps {
	href: string;
	iconName: string;
	label: string;
}

export function FooterLink({ href, iconName, label }: FooterLinkProps) {
	return (
		<Button
			asChild
			variant="ghost"
			size="icon"
			className="h-8 w-8 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
		>
			<Link href={href}>
				<span className="sr-only">{label}</span>
				{icon(iconName)}
			</Link>
		</Button>
	);
}
