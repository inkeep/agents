import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const openApiTagVariants = cva(
  'inline-flex items-center rounded-sm border px-1 py-0.5 text-[10px] font-semibold uppercase border-transparent leading-tight',
  {
    variants: {
      variant: {
        GET: 'bg-emerald-400/20 text-emerald-600 dark:text-emerald-400 group-data-[active=true]/menu-button:bg-emerald-500 dark:group-data-[active=true]/menu-button:bg-emerald-600 group-data-[active=true]/menu-button:text-white',
        POST: 'bg-blue-400/20 text-blue-600 dark:text-blue-400 group-data-[active=true]/menu-button:bg-blue-500 group-data-[active=true]/menu-button:text-white',
        PATCH:
          'bg-orange-400/20 text-orange-600 dark:text-orange-400 group-data-[active=true]/menu-button:bg-orange-500 group-data-[active=true]/menu-button:text-white',
        PUT: 'bg-orange-400/20 text-orange-600 dark:text-orange-400 group-data-[active=true]/menu-button:bg-orange-500 group-data-[active=true]/menu-button:text-white',
        DELETE:
          'bg-red-400/20 text-red-600 dark:text-red-400 group-data-[active=true]/menu-button:bg-red-600 group-data-[active=true]/menu-button:text-white',
      },
    },
    defaultVariants: {},
  }
);

export interface OpenApiTagProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof openApiTagVariants> {}

function OpenApiTag({ className, variant, ...props }: OpenApiTagProps) {
  return <div className={cn(openApiTagVariants({ variant }), className)} {...props} />;
}

export { OpenApiTag, openApiTagVariants };
