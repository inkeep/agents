import Link from "fumadocs-core/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocsPreviousAndNextPage } from "@/lib/source";

interface FooterProps {
	url: string;
}

export function Footer({ url }: FooterProps) {
	const { previous, next } = getDocsPreviousAndNextPage(url);

	return (
		<div className="flex items-center justify-between space-x-4 pt-12 pb-16 text-sm text-gray-600 dark:text-gray-400">
			{previous?.url ? (
				<Link
					href={previous.url}
					className="flex items-center space-x-2 font-medium group "
				>
					<ChevronLeft className="w-4 h-4 stroke-gray-400 dark:stroke-gray-500 group-hover:stroke-gray-600 dark:group-hover:stroke-gray-400" />
					<span className="group-hover:text-gray-900 dark:group-hover:text-gray-200">
						{previous.title}
					</span>
				</Link>
			) : (
				<div />
			)}
			{next?.url && (
				<Link
					href={next.url}
					className="flex items-center space-x-2 font-medium group"
				>
					<span className="group-hover:text-gray-900 dark:group-hover:text-gray-200">
						{next.title}
					</span>
					<ChevronRight className="w-4 h-4 stroke-gray-400 dark:stroke-gray-500 group-hover:stroke-gray-600 dark:group-hover:stroke-gray-400" />
				</Link>
			)}
		</div>
	);
}
