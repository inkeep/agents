import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface EmptyStateProps {
  message: string;
  actionText?: string;
  actionHref?: string;
}

export function EmptyState({ message, actionText, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center items-center">
      <p className="text-sm text-gray-400 dark:text-white/50">{message}</p>
      <div className="inline-block">
        {actionHref && (
          <Link
            target="_blank"
            rel="noopener noreferrer"
            href={actionHref}
            className="font-mono gap-2 text-xs flex items-center uppercase font-medium text-gray-500 hover:text-gray-700"
          >
            {actionText}
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
