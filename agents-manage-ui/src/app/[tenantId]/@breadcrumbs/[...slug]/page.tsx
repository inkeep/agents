import type { Metadata, ResolvingMetadata } from 'next';
import Link from 'next/link';
import type { FC } from 'react';
import { getJobName } from '@/app/[tenantId]/projects/[projectId]/evaluations/jobs/[configId]/page';
import { STATIC_LABELS } from '@/constants/theme';
import { getFullAgentAction } from '@/lib/actions/agent-full';
import { fetchArtifactComponent } from '@/lib/api/artifact-components';
import { fetchCredential } from '@/lib/api/credentials';
import { fetchDataComponent } from '@/lib/api/data-components';
import { fetchDataset } from '@/lib/api/datasets';
import { fetchEvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import { fetchExternalAgent } from '@/lib/api/external-agents';
import { fetchProject } from '@/lib/api/projects';
import { fetchSkill } from '@/lib/api/skills';
import { fetchMCPTool } from '@/lib/api/tools';
import { getScheduledTrigger } from '@/lib/api/scheduled-triggers';
import { getTrigger } from '@/lib/api/triggers';
import { fetchNangoProviders } from '@/lib/mcp-tools/nango';
import { cn } from '@/lib/utils';
import { getErrorCode, getStatusCodeFromErrorCode } from '@/lib/utils/error-serialization';

type LabelKey = keyof typeof STATIC_LABELS;

type FetcherRecord = Record<LabelKey, (id: string) => Promise<string | undefined>>;

interface BreadcrumbItem {
  href: string;
  label: string;
}

function getStaticLabel(segment: string) {
  return segment in STATIC_LABELS ? STATIC_LABELS[segment as LabelKey] : undefined;
}

type BreadcrumbsProps = PageProps<'/[tenantId]/[...slug]'>;

async function getCrumbs(params: BreadcrumbsProps['params']) {
  const { tenantId, slug } = await params;
  const crumbs: BreadcrumbItem[] = [];
  let href = `/${tenantId}`;
  let projectId = '';

  const fetchers: Partial<FetcherRecord> = {
    async projects(id) {
      projectId = id;
      const project = await fetchProject(tenantId, id);
      return project.data.name;
    },
    async agents(id) {
      const result = await getFullAgentAction(tenantId, projectId, id);
      if (result.success) {
        return result.data.name;
      }
      throw {
        message: result.error,
        code: result.code,
      };
    },
    async artifacts(id) {
      const artifact = await fetchArtifactComponent(tenantId, projectId, id);
      return artifact.name;
    },
    async components(id) {
      const component = await fetchDataComponent(tenantId, projectId, id);
      return component.name;
    },
    async credentials(id) {
      const credential = await fetchCredential(tenantId, projectId, id);
      return credential.name;
    },
    async 'external-agents'(id) {
      const externalAgent = await fetchExternalAgent(tenantId, projectId, id);
      return externalAgent.name;
    },
    async 'mcp-servers'(id) {
      const tool = await fetchMCPTool(tenantId, projectId, id);
      return tool.name;
    },
    async providers(id) {
      const providers = await fetchNangoProviders();
      for (const provider of providers) {
        if (encodeURIComponent(provider.name) === id) {
          return provider.display_name;
        }
      }
    },
    async conversations() {
      return 'Conversation Details';
    },
    async jobs(id) {
      const jobConfig = await fetchEvaluationJobConfig(tenantId, projectId, id);
      return getJobName({ tenantId, projectId, jobConfig });
    },
    async 'run-configs'(id) {
      const runConfig = await fetchEvaluationRunConfig(tenantId, projectId, id);
      return runConfig.name;
    },
    async datasets(id) {
      const dataset = await fetchDataset(tenantId, projectId, id);
      return dataset.name || 'Test Suite';
    },
    async runs(_id) {
      return 'Run';
    },
    async triggers(id) {
      const trigger = await getTrigger(tenantId, projectId, slug[3], id);
      return trigger.name;
    },
    async skills(id) {
      const result = await fetchSkill(tenantId, projectId, id);
      return result.name;
    },
    async 'scheduled-triggers'(id) {
      const trigger = await getScheduledTrigger(tenantId, projectId, slug[3], id);
      return trigger.name;
    },
  };

  function addCrumb({ segment, label }: { segment: string; label: string }) {
    href += `/${segment}`;

    // These routes aren't exist so we don't add it to crumbs list
    const routesWithoutBreadcrumbs = new Set([
      `/${tenantId}/projects/${projectId}/traces/conversations`,
      `/${tenantId}/projects/${projectId}/evaluations/jobs`,
      `/${tenantId}/projects/${projectId}/evaluations/run-configs`,
      `/${tenantId}/projects/${projectId}/datasets/${slug[3]}/runs`,
      `/${tenantId}/projects/${projectId}/agents/${slug[3]}/triggers/${slug[5]}`,
      ...(slug[3] === 'new' ? [] : [`/${tenantId}/projects/${projectId}/skills/${slug[3]}`]),
    ]);

    if (!routesWithoutBreadcrumbs.has(href)) {
      crumbs.push({ label, href });
    }
  }

  for (const [index, segment] of slug.entries()) {
    let label: string | undefined;
    try {
      const prev = slug[index - 1];

      if (segment === 'new') {
        const parentLabel = getStaticLabel(prev);
        label = parentLabel ? `New ${parentLabel.replace(/s$/, '')}` : 'New';
      } else {
        const fetcher = Object.hasOwn(fetchers, prev)
          ? fetchers[prev as keyof typeof fetchers]
          : undefined;
        label = fetcher ? await fetcher(segment) : getStaticLabel(segment);
        if (!label) {
          throw new Error(`Unknown breadcrumb segment "${segment}"`);
        }
      }
    } catch (error) {
      const errorCode = getErrorCode(error);
      const resolvedStatusCode = getStatusCodeFromErrorCode(errorCode);
      label = resolvedStatusCode ? `${resolvedStatusCode} Error` : 'Error';
      addCrumb({ segment, label });
      break; // stop traversing if error occurs in some segment
    }
    addCrumb({ segment, label });
  }

  return crumbs;
}

const BreadcrumbSlot: FC<BreadcrumbsProps> = async ({ params }) => {
  const crumbs = await getCrumbs(params);
  return crumbs.map(({ label, href }, idx, arr) => {
    const isLast = idx === arr.length - 1;
    return (
      <li
        key={href}
        aria-current={isLast ? 'page' : undefined}
        className={cn(
          'shrink-0',
          isLast
            ? 'font-medium text-foreground'
            : 'after:ml-2 after:content-["›"] after:text-muted-foreground/60'
        )}
      >
        {isLast ? (
          label
        ) : (
          <Link href={href} className="hover:text-foreground">
            {label}
          </Link>
        )}
      </li>
    );
  });
};

export async function generateMetadata(
  { params }: BreadcrumbsProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const parentMetadata = await parent;
  const hasParentTitle = !parentMetadata.title?.template;
  if (hasParentTitle) {
    return {};
  }
  const crumbs = await getCrumbs(params);
  const lastCrumb = crumbs.at(-1);
  return {
    title: lastCrumb?.label,
  };
}

export default BreadcrumbSlot;
