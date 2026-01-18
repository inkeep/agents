import {
  BotIcon,
  CodeIcon,
  ComponentIcon,
  GlobeIcon,
  HammerIcon,
  LayersIcon,
  LibraryIcon,
  LockIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
  SplineIcon,
  WorkflowIcon,
} from 'lucide-react';

type OperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'list'
  | 'get'
  | 'associate'
  | 'remove'
  | 'check'
  | 'unknown';

interface ParsedToolName {
  resource: string;
  operationType: OperationType;
  displayName: string;
  icon: LucideIcon;
}

const OPERATIONS = [
  'create',
  'update',
  'delete',
  'list',
  'get',
  'associate',
  'remove',
  'check',
] as const;

const ENTITY_DISPLAY_CONFIG: Record<string, { displayName: string; icon: LucideIcon }> = {
  projects: { displayName: 'Project', icon: LayersIcon },
  project: { displayName: 'Project', icon: LayersIcon },
  agents: { displayName: 'Agent', icon: WorkflowIcon },
  agent: { displayName: 'Agent', icon: WorkflowIcon },
  'sub-agent': { displayName: 'Sub Agent', icon: BotIcon },
  'sub-agent-relations': { displayName: 'Sub Agent Relation', icon: SplineIcon },
  'sub-agent-external-agent-relations': {
    displayName: 'External Agent Relation',
    icon: SplineIcon,
  },
  'sub-agent-team-agent-relations': { displayName: 'Team Agent Relation', icon: SplineIcon },
  'sub-agent-tool-relations': { displayName: 'Tool Relation', icon: SplineIcon },
  'agent-artifact-component-relations': {
    displayName: 'Artifact Component Relation',
    icon: SplineIcon,
  },
  'agent-data-component-relations': { displayName: 'Data Component Relation', icon: SplineIcon },
  'artifact-component': { displayName: 'Artifact Component', icon: LibraryIcon },
  'context-config': { displayName: 'Context Config', icon: SettingsIcon },
  conversations: { displayName: 'Conversation', icon: MessageSquareIcon },
  credential: { displayName: 'Credential', icon: LockIcon },
  'credential-store': { displayName: 'Credential Store', icon: LockIcon },
  'data-component': { displayName: 'Data Component', icon: ComponentIcon },
  'external-agents': { displayName: 'External Agent', icon: GlobeIcon },
  'function-tools': { displayName: 'Function Tool', icon: CodeIcon },
  functions: { displayName: 'Function', icon: CodeIcon },
  tools: { displayName: 'Tool', icon: HammerIcon },
  tool: { displayName: 'Tool', icon: HammerIcon },
};

const formatDisplayName = (resource: string): string => {
  return resource
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const parseToolNameForDisplay = (toolName: string): ParsedToolName => {
  const parts = toolName.split('-');

  const actionIndex = parts.findIndex((part) =>
    OPERATIONS.includes(part as (typeof OPERATIONS)[number])
  );

  if (actionIndex === -1) {
    return {
      resource: toolName,
      operationType: 'unknown',
      displayName: formatDisplayName(toolName),
      icon: SettingsIcon,
    };
  }

  const resource = parts.slice(0, actionIndex).join('-');
  const operation = parts[actionIndex] as OperationType;

  const config = ENTITY_DISPLAY_CONFIG[resource];

  return {
    resource,
    operationType: operation,
    displayName: config?.displayName ?? formatDisplayName(resource),
    icon: config?.icon ?? SettingsIcon,
  };
};
