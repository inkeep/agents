'use client';

import { SUPPORT_COPILOT_PLATFORMS } from '@inkeep/agents-core/client-exports';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { ChromePinIcon, ChromePuzzleIcon } from '@/icons';
import type { App } from '@/lib/api/apps';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import { AdminNote } from './admin-note';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/inkeep-ai-agents/lgjppelahndeddnljphpddakaccjdeig';
const CHROME_EXTENSION_ID = 'lgjppelahndeddnljphpddakaccjdeig';
const ZENDESK_MARKETPLACE_URL = 'https://www.zendesk.com/marketplace/apps/support/1241226/';

interface SupportCopilotInstallDialogProps {
  app: App;
  open: boolean;
  onClose: () => void;
}

interface StepContent {
  title: string;
  description: string;
  descriptionNode?: ReactNode;
  hint?: string;
  link?: { url: string; label: string };
}

function buildSteps(platformLabel: string | undefined, isZendesk: boolean): StepContent[] {
  if (isZendesk) {
    return [
      {
        title: 'Install the Inkeep Agents app from the Zendesk Marketplace',
        description:
          'Add the Inkeep Agents app to your Zendesk account from the Zendesk Marketplace. A Zendesk admin must approve the install.',
        link: { url: ZENDESK_MARKETPLACE_URL, label: 'Open Zendesk Marketplace' },
      },
      {
        title: 'Log in',
        description:
          'Open any ticket in Zendesk and log in with your Inkeep account. The app will detect your workspace automatically.',
        hint: "Requires project membership — contact your admin if you can't sign in.",
      },
      {
        title: 'Open a ticket in Zendesk',
        description:
          'The Inkeep Agents app appears in the ticket sidebar. Your configured quick actions will show at the top — click one to send its message.',
      },
    ];
  }

  return [
    {
      title: 'Install the Inkeep AI Agents extension',
      description:
        'Add the Inkeep AI Agents extension to your browser. Click the link below to open the Chrome Web Store. Then install the extension.',
      link: { url: CHROME_STORE_URL, label: 'Open Chrome Web Store' },
    },
    {
      title: 'Pin the extension to your toolbar',
      description:
        "Click Chrome's puzzle-piece icon in the toolbar, find Inkeep AI Agents, and click the pin icon next to it. Without pinning, the extension hides behind the Extensions menu.",
      descriptionNode: (
        <>
          <span className="inline-flex items-center gap-1">
            Click Chrome's
            <ChromePuzzleIcon className="size-3.5" aria-hidden="true" />
            puzzle-piece icon
          </span>{' '}
          in the toolbar, find Inkeep AI Agents, and{' '}
          <span className="inline-flex items-center gap-1">
            click the
            <ChromePinIcon className="size-3.5" aria-hidden="true" />
            pin icon
          </span>{' '}
          next to it. Without pinning, the extension hides behind the Extensions menu.
        </>
      ),
    },
    {
      title: 'Sign in to the extension',
      description: 'Open the extension and sign in with your Inkeep account.',
      hint: "Requires project membership — contact your admin if you can't sign in.",
    },
    {
      title: platformLabel
        ? `Open a ticket in ${platformLabel}`
        : 'Open a ticket in your support platform',
      description:
        "The Support Copilot app appears alongside tickets. If your admin configured quick actions, they'll show at the top — click one to send its message.",
    },
  ];
}

function buildHeader(platformLabel: string | undefined, isZendesk: boolean) {
  if (isZendesk) {
    return {
      title: 'Install Support Copilot',
      description:
        'Install the Inkeep Support Copilot app from the Zendesk Marketplace to start using this app inside Zendesk tickets.',
    };
  }
  return {
    title: 'Install Support Copilot',
    description: platformLabel
      ? `Get the Inkeep AI Agents extension running alongside ${platformLabel} to start using this app.`
      : 'Get the extension running alongside your support platform to start using this app.',
  };
}

function buildShareableInstructions(
  header: { title: string; description: string },
  steps: StepContent[]
): string {
  const lines: string[] = [header.title, header.description, ''];
  steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.title}`);
    lines.push(`   ${step.description}`);
    if (step.hint) lines.push(`   ${step.hint}`);
    if (step.link) lines.push(`   ${step.link.label}: ${step.link.url}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

export function SupportCopilotInstallDialog({
  app,
  open,
  onClose,
}: SupportCopilotInstallDialogProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const config = app.config?.type === 'support_copilot' ? app.config.supportCopilot : undefined;
  const platform = config?.platform
    ? SUPPORT_COPILOT_PLATFORMS.find((p) => p.slug === config.platform)
    : undefined;
  const platformLabel = platform?.label;
  const isZendesk = platform?.slug === 'zendesk';
  const { isCopied, copyToClipboard } = useCopyToClipboard({});

  const header = buildHeader(platformLabel, isZendesk);
  const steps = buildSteps(platformLabel, isZendesk);
  const shareableText = buildShareableInstructions(header, steps);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{header.title}</DialogTitle>
          <DialogDescription>{header.description}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          {steps.map((step, index) => (
            <Step key={step.title} index={index + 1} step={step} />
          ))}
        </ol>

        {canEdit && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(shareableText)}
            >
              {isCopied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {isCopied ? 'Copied' : 'Copy instructions'}
            </Button>
          </div>
        )}

        {canEdit && (
          <AdminNote
            tenantId={tenantId}
            projectId={projectId}
            isZendesk={isZendesk}
            chromeExtensionId={CHROME_EXTENSION_ID}
          />
        )}

        <DialogFooter>
          {!canEdit && (
            <Button type="button" variant="outline" onClick={() => copyToClipboard(shareableText)}>
              {isCopied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {isCopied ? 'Copied' : 'Copy instructions'}
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ index, step }: { index: number; step: StepContent }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium text-muted-foreground">
        {index}
      </span>
      <div className="flex-1 space-y-2 pt-0.5">
        <p className="text-sm font-medium">{step.title}</p>
        <p className="text-sm text-muted-foreground">{step.descriptionNode ?? step.description}</p>
        {step.hint && <p className="text-xs italic text-muted-foreground/80">{step.hint}</p>}
        {step.link && (
          <Button variant="outline" size="sm" asChild>
            <a href={step.link.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3" aria-hidden="true" />
              {step.link.label}
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}
