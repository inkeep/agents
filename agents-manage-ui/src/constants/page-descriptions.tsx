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

export const agentDescription = (
  <>
    Agents are visual representations of the data flow between sub agents and tools.
    {'\n'}
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/agent`}>Learn more</ExternalLink>
  </>
);

export const apiKeyDescription = (
  <>
    API keys are use to authenticate against the Inkeep Agents API. They are associated with an
    agent and can be used to chat with the agent programmatically.
    {'\n'}
  </>
);
