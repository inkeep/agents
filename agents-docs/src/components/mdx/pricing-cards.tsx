'use client';

import { ArrowRight, Building, Check, Cloud, Code } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { cn } from '@/lib/utils';

interface PricingTier {
  name: string;
  tagline: string;
  price: string;
  priceDetail?: string;
  icon: React.ReactNode;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
  badge?: string;
}

const tiers: PricingTier[] = [
  {
    name: 'Open Source',
    tagline: 'Everything you need to create AI Agents',
    price: 'Free',
    priceDetail: 'forever',
    icon: <Code className="h-6 w-6" />,
    features: [
      'Visual Builder & SDK',
      'MCP Servers & Tools',
      'Observability & UI Lib',
      'Use with Claude/Cursor',
      'Deploy to Vercel or Docker',
    ],
    cta: { label: 'Quick Start', href: '/get-started/quick-start' },
  },
  {
    name: 'Inkeep Cloud',
    tagline: 'Everything in Open Source plus:',
    price: 'Usage-based',
    priceDetail: 'transparent pricing',
    icon: <Cloud className="h-6 w-6" />,
    features: [
      'Fully managed cloud hosting',
      'No infra management',
      'Transparent, usage-based pricing',
    ],
    cta: { label: 'Join the Waitlist', href: 'https://inkeep.com/cloud-waitlist' },
    badge: 'Coming Soon',
  },
  {
    name: 'Enterprise',
    tagline: 'Everything in Open Source plus:',
    price: 'Custom',
    priceDetail: 'dedicated support',
    icon: <Building className="h-6 w-6" />,
    features: [
      'Dedicated forward deployed engineer',
      'Unified AI Search (Managed RAG)',
      'Use from Slack & Support Platforms',
      'PII removal and data controls',
      'Cloud Hosting & User Management',
      'Trainings, enablement, and support',
    ],
    cta: { label: 'Schedule a Demo', href: 'https://inkeep.com/demo' },
    highlighted: true,
    badge: 'Most Popular',
  },
];

function PricingCard({ tier }: { tier: PricingTier }) {
  const isExternal = tier.cta.href.startsWith('http');

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-6 transition-shadow',
        tier.highlighted
          ? 'border-[hsl(var(--primary))] shadow-md shadow-[hsl(var(--primary))]/5 dark:shadow-[hsl(var(--primary))]/10'
          : 'border-fd-border'
      )}
    >
      {tier.badge && (
        <div
          className={cn(
            'absolute -top-3 left-4 rounded-full px-3 py-0.5 text-xs font-medium',
            tier.highlighted
              ? 'bg-[hsl(var(--primary))] text-white'
              : 'bg-fd-muted text-fd-muted-foreground'
          )}
        >
          {tier.badge}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            tier.highlighted
              ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
              : 'bg-fd-muted text-fd-muted-foreground'
          )}
        >
          {tier.icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-fd-foreground">{tier.name}</h3>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-fd-foreground">{tier.price}</span>
          {tier.priceDetail && (
            <span className="text-sm text-fd-muted-foreground">{tier.priceDetail}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-fd-muted-foreground">{tier.tagline}</p>
      </div>

      <ul className="mb-6 flex flex-1 flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-fd-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href={tier.cta.href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          tier.highlighted
            ? 'bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90'
            : 'border border-fd-border bg-fd-background text-fd-foreground hover:bg-fd-muted'
        )}
      >
        {tier.cta.label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function PricingCards() {
  return (
    <div className="not-prose mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => (
        <PricingCard key={tier.name} tier={tier} />
      ))}
    </div>
  );
}
