"use client";

import clsx from "clsx";
import { SearchIcon } from "lucide-react";
import dynamic from "next/dynamic";
import type { ButtonHTMLAttributes } from "react";

const Kbd = dynamic(() => import("@/components/kbd").then((mod) => mod.Kbd), {
	ssr: false,
});

export function SearchToggle(props: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			id="search-trigger"
			data-search-full=""
			{...props}
			className={clsx(
				"inline-flex items-center gap-2 rounded-full border p-1.5 text-sm text-fd-muted-foreground/70 transition-colors hover:bg-fd-secondary/50 hover:text-fd-accent-foreground/70",
				props.className,
			)}
		>
			<SearchIcon className="ms-1 size-4" />
			Search or ask...
			<div className="ms-auto inline-flex gap-[1px]">
				<Kbd />
			</div>
		</button>
	);
}
