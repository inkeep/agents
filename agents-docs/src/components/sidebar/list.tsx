"use client";

import { useEffect, useRef } from "react";
import { File } from "@/components/sidebar/file";
import { Folder, type SidebarPage } from "@/components/sidebar/folder";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@/components/ui/sidebar";

export function List({ groups }: { groups: (SidebarPage | undefined)[] }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const activeItem = ref.current?.querySelector('[data-active="true"]');

		if (activeItem) {
			activeItem.scrollIntoView({
				block: "center",
			});
		}
	}, []);

	return (
		<SidebarContent ref={ref}>
			{groups.map((group, i) => {
				if (!group) return;

				return (
					<SidebarGroup key={i}>
						{group.group && (
							<SidebarGroupLabel>{group.group}</SidebarGroupLabel>
						)}
						<SidebarGroupContent>
							<SidebarMenu>
								{group.pages?.map((page, i) => {
									if (!page) return;
									if ("group" in page) {
										return <Folder key={i} item={page} />;
									}
									return <File key={i} item={page} />;
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				);
			})}
		</SidebarContent>
	);
}
