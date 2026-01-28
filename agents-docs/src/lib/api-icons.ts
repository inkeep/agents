import * as luIcons from 'lucide-react';
import * as tbIcons from 'react-icons/tb';

export const getApiIcon = (endpoint: string) => {
  switch (endpoint) {
    case 'a2a':
      return luIcons['Network'];
    case 'agents':
      return luIcons['User'];
    case 'api-keys':
      return luIcons['KeyRound'];
    case 'artifact-components':
      return tbIcons['TbInputSpark'];
    case 'branches':
      return luIcons['GitBranch'];
    case 'chat':
      return luIcons['MessagesSquare'];
    case 'cli':
      return luIcons['Terminal'];
    case 'context-configs':
      return luIcons['CirclePlus'];
    case 'conversations':
      return luIcons['MessageSquare'];
    case 'credential-stores':
      return luIcons['Database'];
    case 'credentials':
      return luIcons['Key'];
    case 'data-components':
      return luIcons['Blocks'];
    case 'evaluations':
      return luIcons['FlaskConical'];
    case 'external-agents':
      return luIcons['Globe'];
    case 'function-tools':
      return luIcons['Code'];
    case 'functions':
      return luIcons['Code2'];
    case 'invitations':
      return luIcons['UserPlus'];
    case 'mcp-catalog':
      return luIcons['Library'];
    case 'mcp':
      return luIcons['Server'];
    case 'oauth':
      return luIcons['ShieldCheck'];
    case 'project-members':
      return luIcons['Users'];
    case 'project-permissions':
      return luIcons['Shield'];
    case 'projects':
      return luIcons['FolderOpen'];
    case 'refs':
      return luIcons['Link'];
    case 'sub-agents':
      return luIcons['Spline'];
    case 'third-party-mcp-servers':
      return luIcons['ServerCog'];
    case 'tools':
      return luIcons['Hammer'];
    case 'triggers':
      return luIcons['Webhook'];
    case 'user-organizations':
      return luIcons['Building'];
    case 'user-project-memberships':
      return luIcons['UserCheck'];
    case 'webhooks':
      return luIcons['Webhook'];
    case 'workflows':
      return luIcons['Workflow'];
    default:
      return luIcons['Sparkles'];
  }
};
