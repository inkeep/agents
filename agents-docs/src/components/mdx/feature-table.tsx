'use client';

import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type CellValue = true | false | string;

interface FeatureRow {
  feature: string;
  openSource: CellValue;
  cloud: CellValue;
  enterprise: CellValue;
}

interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const sections: FeatureSection[] = [
  {
    title: 'Building Agents',
    rows: [
      { feature: 'No-Code Visual Builder', openSource: true, cloud: true, enterprise: true },
      {
        feature: 'Agent Developer SDK (TypeScript)',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: '2-way Sync: Edit in Code or UI',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Core Framework',
    rows: [
      {
        feature: 'Take actions on any MCP Server, App, or API',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Multi-agent Architecture (Teams of Agents)',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Agent Credential and Permissions Management',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Agent Traces available in UI and OTEL',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Talk to Agents via A2A, MCP, and Vercel AI SDK formats',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Talk to Your Agents (Out of the Box)',
    rows: [
      {
        feature: 'With Claude, ChatGPT, and Cursor',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'With Slack, Discord, and Teams integrations',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: 'With Zendesk, Salesforce, and support integrations',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Building Agent UIs',
    rows: [
      {
        feature: 'Agent Messages with Custom UIs (forms, cards, etc.)',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Custom UIs using Vercel AI SDK format',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Out-of-box Chat Components (React, JS)',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Answers with Inline Citations',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Unified AI Search (Managed RAG)',
    rows: [
      {
        feature: 'Real-time fetch from databases, APIs, and the web',
        openSource: true,
        cloud: true,
        enterprise: true,
      },
      {
        feature: 'Public sources ingestion (docs, help center, etc.)',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: 'Private sources ingestion (Notion, Confluence, etc.)',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: 'Optimized Retrieval and Search (Managed RAG)',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      { feature: 'Semantic Search', openSource: false, cloud: false, enterprise: true },
    ],
  },
  {
    title: 'Insights & Analytics',
    rows: [
      {
        feature: 'AI Reports on Knowledge Gaps',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: 'AI Reports on Product Feature Gaps',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Authentication and Authorization',
    rows: [
      { feature: 'Single Sign-on', openSource: false, cloud: false, enterprise: true },
      { feature: 'Role-Based Access Control', openSource: false, cloud: false, enterprise: true },
      { feature: 'Audit Logs', openSource: false, cloud: false, enterprise: true },
    ],
  },
  {
    title: 'Security',
    rows: [
      { feature: 'PII Removal', openSource: false, cloud: false, enterprise: true },
      { feature: 'Uptime and Support SLAs', openSource: false, cloud: false, enterprise: true },
      {
        feature: 'SOC II Type II and Pentest Reports',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: 'GDPR, HIPAA, DPA, and Infosec Reviews',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
    ],
  },
  {
    title: 'Deployment',
    rows: [
      {
        feature: 'Hosting Types',
        openSource: 'Self-hosted',
        cloud: 'Cloud',
        enterprise: 'Cloud, Hybrid, or Self-hosted',
      },
      {
        feature: 'Support Type',
        openSource: 'Community',
        cloud: 'Community',
        enterprise: 'Dedicated Engineering Team',
      },
    ],
  },
  {
    title: 'Forward Deployed Engineer Program',
    rows: [
      {
        feature: 'Dedicated Architect and AI Agents Engineer',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      {
        feature: '1:1 Office Hours and Trainings',
        openSource: false,
        cloud: false,
        enterprise: true,
      },
      { feature: 'Structured Pilot', openSource: false, cloud: false, enterprise: true },
    ],
  },
];

function CellContent({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10">
        <Check className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
      </span>
    );
  }
  if (value === false) {
    return <Minus className="h-4 w-4 text-fd-muted-foreground/40" />;
  }
  return <span className="text-sm text-fd-foreground">{value}</span>;
}

export function FeatureTable() {
  return (
    <div className="not-prose mt-8 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-fd-border">
            <th className="w-[40%] py-3 pr-4 text-left text-sm font-medium text-fd-muted-foreground">
              Feature
            </th>
            <th className="w-[20%] py-3 text-center text-sm font-medium text-fd-muted-foreground">
              Open Source
            </th>
            <th className="w-[20%] py-3 text-center text-sm font-medium text-fd-muted-foreground">
              Cloud
            </th>
            <th className="w-[20%] py-3 text-center text-sm font-medium text-fd-muted-foreground">
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <SectionGroup key={section.title} section={section} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionGroup({ section }: { section: FeatureSection }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-6 pb-2 text-sm font-semibold text-fd-foreground">
          {section.title}
        </td>
      </tr>
      {section.rows.map((row, idx) => (
        <tr
          key={row.feature}
          className={cn(
            'border-b border-fd-border/50 transition-colors hover:bg-fd-muted/30',
            idx === section.rows.length - 1 && 'border-b-0'
          )}
        >
          <td className="py-2.5 pr-4 text-sm text-fd-foreground">{row.feature}</td>
          <td className="py-2.5 text-center">
            <div className="flex items-center justify-center">
              <CellContent value={row.openSource} />
            </div>
          </td>
          <td className="py-2.5 text-center">
            <div className="flex items-center justify-center">
              <CellContent value={row.cloud} />
            </div>
          </td>
          <td className="py-2.5 text-center">
            <div className="flex items-center justify-center">
              <CellContent value={row.enterprise} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
