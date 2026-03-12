// URL Display Component
import type { FC, ReactNode } from 'react';

export const URLDisplay: FC<{ children: ReactNode }> = ({ children }) => {
  if (!children) {
    return;
  }
  return <code className="block text-xs text-muted-foreground break-all">{children}</code>;
};
