import { ExternalLink } from '@/components/ui/external-link';

export const DOCS_BASE_URL = 'https://docs.inkeep.com';

export const artifactDescription = (
  <>
    Artifacts automatically capture and store source information from tool and agent interactions,
    providing a record of where data originates.
    {'\n'}
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/artifact-components`}>
      Learn more
    </ExternalLink>
  </>
);
