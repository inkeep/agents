'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

interface ExpandableRowProps {
  feature: string;
  featureNote?: ReactNode;
  inkeepCell: ReactNode;
  competitorCell: ReactNode;
  isEven: boolean;
}

export function ExpandableRow({
  feature,
  featureNote,
  inkeepCell,
  competitorCell,
  isEven,
}: ExpandableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasNote = !!featureNote;

  return (
    <>
      <tr
        onClick={hasNote ? () => setIsExpanded(!isExpanded) : undefined}
        className={`border-b border-fd-border last:border-b-0 transition-all duration-200 ${
          isEven ? 'bg-white dark:bg-transparent' : 'bg-fd-muted/10'
        } ${hasNote ? 'cursor-pointer group hover:bg-fd-accent/5' : 'hover:bg-fd-muted/30'}`}
      >
        <td className="p-4 font-medium">
          <span className="flex items-center gap-2.5">
            {hasNote && (
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-md transition-all duration-300 ease-out ${
                  isExpanded 
                    ? 'bg-fd-primary/10 text-fd-primary rotate-180' 
                    : 'bg-fd-muted/40 text-fd-muted-foreground group-hover:bg-fd-primary/10 group-hover:text-fd-primary'
                }`}
              >
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none" 
                  className="transition-transform duration-300"
                >
                  <path 
                    d="M2.5 4.5L6 8L9.5 4.5" 
                    stroke="currentColor" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            <span className={hasNote ? 'group-hover:text-fd-primary transition-colors duration-200' : ''}>
              {feature}
            </span>
          </span>
        </td>
        <td className="p-4 text-center align-top">{inkeepCell}</td>
        <td className="p-4 text-center align-top">{competitorCell}</td>
      </tr>
      {isExpanded && featureNote && (
        <tr 
          className="animate-in slide-in-from-top-1 fade-in duration-200"
        >
          <td colSpan={3} className="px-4 pb-4 pt-0">
            <div className="pl-4 py-1 text-sm text-fd-muted-foreground bg-fd-muted/5 rounded-r-md">
              {featureNote}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}