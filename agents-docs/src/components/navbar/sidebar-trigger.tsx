"use client";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function SidebarTrigger() {
	const { toggleSidebar, openMobile } = useSidebar();

	return (
		<button
			type="button"
			onClick={toggleSidebar}
			className={clsx(
				buttonVariants({
					variant: "ghost",
					size: "icon-sm",
					className:
						"-me-2 lg:hidden text-fd-muted-foreground hover:text-fd-accent-foreground",
				}),
			)}
		>
			{openMobile ? <X /> : <Menu />}
		</button>
	);
}
