import type { ReactNode } from 'react';

interface SkillRuleProps {
  id: string;
  skills: string | string[];
  title: string;
  description?: string;
  children: ReactNode;
}

export function SkillRule({ children }: SkillRuleProps) {
  return <>{children}</>;
}
