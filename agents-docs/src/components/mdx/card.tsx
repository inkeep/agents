import { Card as OriginalCard } from '@inkeep/docskit/mdx';
import { ChevronRight } from 'lucide-react';
import React from 'react';
import * as brandIcons from '@/components/brand-icons';

interface CardProps {
  title: string;
  icon?: string;
  href?: string;
  children?: React.ReactNode;
  description?: React.ReactNode;
  external?: boolean;
  className?: string;
  color?: string;
}

export function Card({ icon: iconName, ...props }: CardProps) {
  // Check if this is a brand icon
  if (iconName?.startsWith('brand/')) {
    const brandIconName = iconName.split('brand/')[1] as keyof typeof brandIcons;
    const BrandIcon = brandIcons[brandIconName];

    if (BrandIcon) {
      const Component = props.href ? 'a' : 'div';
      const titleWords = props.title.toString().split(' ');

      return (
        <Component
          data-card
          href={props.href}
          className="block border text-fd-card-foreground transition-colors group/card relative rounded-lg p-6 transition-shadow hover:shadow-[0_1px_7px_-4px_rgba(19,19,22,0.8),0_4px_11px_rgba(32,42,54,0.05)] dark:hover:shadow-none [&_svg]:text-[var(--card-color)]"
          style={{ '--card-color': props.color } as React.CSSProperties}
          {...(props.external && { target: '_blank', rel: 'noopener noreferrer' })}
        >
          {props.href && (
            <div className="absolute pointer-events-none -inset-px rounded-lg border-2 border-transparent opacity-0 [background:linear-gradient(var(--quick-links-hover-bg,theme(colors.gray.50)),var(--quick-links-hover-bg,theme(colors.gray.50)))_padding-box,linear-gradient(to_top,hsl(var(--primary)),hsl(var(--primary)),hsl(var(--primary-light)))_border-box] group-hover/card:opacity-100 dark:[--quick-links-hover-bg:theme(colors.gray.900)]" />
          )}
          <div className="relative">
            <div className="mb-6 text-gray-400 transition group-hover/card:text-gray-500 dark:text-gray-500 dark:group-hover/card:text-gray-300 [&>svg]:h-6 [&>svg]:w-auto">
              <BrandIcon />
            </div>
            <h2 className="mb-2 mt-2 text-base/5 font-semibold text-gray-950 dark:text-white">
              {titleWords.map((word, i) =>
                i === titleWords.length - 1 ? (
                  <span key={word} className="whitespace-nowrap">
                    {word}
                    <ChevronRight className="relative top-[0.1875rem] ml-0.5 inline-block w-4 h-4 -translate-x-2 text-gray-300 align-top opacity-0 transition duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] group-hover/card:translate-x-0 group-hover/card:stroke-gray-500 group-hover/card:opacity-100 dark:group-hover/card:stroke-white/50" />
                  </span>
                ) : (
                  <React.Fragment key={word}>{word} </React.Fragment>
                )
              )}
              <span className="absolute inset-0" />
            </h2>
            {props.children && (
              <div className="text-sm text-fd-muted-foreground prose-no-margin">
                {props.children}
              </div>
            )}
          </div>
        </Component>
      );
    }
  }

  // Pass through to original Card for regular lucide icons
  return <OriginalCard {...props} icon={iconName || ''} />;
}
