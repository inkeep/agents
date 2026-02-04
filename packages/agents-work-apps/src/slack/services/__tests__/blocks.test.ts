/**
 * Tests for Slack Block Kit message builders
 *
 * Tests all message builders in blocks/index.ts including:
 * - Link and connection messages
 * - Status messages (connected/not connected)
 * - Help and command reference messages
 * - Agent list and settings messages
 * - Error and success messages
 */

import { describe, expect, it } from 'vitest';
import {
  createAgentListMessage,
  createAgentResponseMessage,
  createAlreadyConnectedMessage,
  createAlreadyLinkedMessage,
  createDeviceCodeMessage,
  createErrorMessage,
  createHelpMessage,
  createLinkExpiredMessage,
  createLinkMessage,
  createLinkSuccessMessage,
  createLogoutSuccessMessage,
  createNoDefaultAgentMessage,
  createNoProjectsMessage,
  createNotLinkedMessage,
  createProjectListMessage,
  createSettingsMessage,
  createSettingsUpdatedMessage,
  createStatusConnectedMessage,
  createStatusNotConnectedMessage,
  createThinkingMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';

describe('Slack Block Builders', () => {
  describe('createLinkMessage', () => {
    it('should create a link message with dashboard URL', () => {
      const dashboardUrl = 'https://app.inkeep.com/default/work-apps/slack';
      const result = createLinkMessage(dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(result.blocks?.length).toBeGreaterThan(0);
      expect(JSON.stringify(result)).toContain('Connect your Inkeep account');
      expect(JSON.stringify(result)).toContain(dashboardUrl);
    });
  });

  describe('createAlreadyConnectedMessage', () => {
    it('should create message showing connection status', () => {
      const email = 'test@example.com';
      const linkedAt = '2026-01-25T12:00:00Z';
      const dashboardUrl = 'https://app.inkeep.com/dashboard';

      const result = createAlreadyConnectedMessage(email, linkedAt, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Already Connected');
      expect(JSON.stringify(result)).toContain(email);
    });
  });

  describe('createStatusConnectedMessage', () => {
    it('should create connected status message with user details', () => {
      const userName = 'testuser';
      const email = 'test@example.com';
      const linkedAt = '2026-01-25T12:00:00Z';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createStatusConnectedMessage(userName, email, linkedAt, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Connected to Inkeep');
      expect(JSON.stringify(result)).toContain(userName);
      expect(JSON.stringify(result)).toContain(email);
    });
  });

  describe('createStatusNotConnectedMessage', () => {
    it('should create not connected status message', () => {
      const userName = 'testuser';
      const teamDomain = 'mycompany';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createStatusNotConnectedMessage(userName, teamDomain, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Not Linked');
      expect(JSON.stringify(result)).toContain(userName);
      expect(JSON.stringify(result)).toContain(teamDomain);
    });
  });

  describe('createLogoutSuccessMessage', () => {
    it('should create logout success message', () => {
      const result = createLogoutSuccessMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Logged out successfully');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });

  describe('createProjectListMessage', () => {
    it('should create project list message with multiple projects', () => {
      const email = 'test@example.com';
      const projects = [
        { id: 'proj-1', name: 'Project One', description: 'First project' },
        { id: 'proj-2', name: 'Project Two', description: null },
        { id: 'proj-3', name: null, description: 'Third project' },
      ];
      const dashboardUrl = 'https://app.inkeep.com';
      const totalCount = 3;

      const result = createProjectListMessage(email, projects, dashboardUrl, totalCount);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Your Inkeep Projects');
      expect(JSON.stringify(result)).toContain('Project One');
      expect(JSON.stringify(result)).toContain('Project Two');
    });

    it('should show more text when total exceeds 10', () => {
      const projects = Array.from({ length: 10 }, (_, i) => ({
        id: `proj-${i}`,
        name: `Project ${i}`,
        description: null,
      }));
      const totalCount = 15;

      const result = createProjectListMessage(
        'test@example.com',
        projects,
        'https://app.inkeep.com',
        totalCount
      );

      expect(JSON.stringify(result)).toContain('and 5 more');
    });
  });

  describe('createNoProjectsMessage', () => {
    it('should create no projects message', () => {
      const email = 'test@example.com';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createNoProjectsMessage(email, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('No projects found');
      expect(JSON.stringify(result)).toContain('Create Project');
    });
  });

  describe('createHelpMessage', () => {
    it('should create help message with commands', () => {
      const result = createHelpMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Inkeep Slack Commands');
      expect(JSON.stringify(result)).toContain('/inkeep link');
      expect(JSON.stringify(result)).toContain('/inkeep status');
      expect(JSON.stringify(result)).toContain('/inkeep help');
    });
  });

  describe('createErrorMessage', () => {
    it('should create error message with custom text', () => {
      const errorText = 'Something went wrong!';

      const result = createErrorMessage(errorText);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain(errorText);
    });

    it('should include error emoji', () => {
      const result = createErrorMessage('Error occurred');

      expect(JSON.stringify(result)).toContain('❌');
    });
  });

  describe('createAgentResponseMessage', () => {
    it('should create agent response without share button when no channel', () => {
      const agentName = 'Support Agent';
      const response = 'Here is your answer based on our documentation.';

      const result = createAgentResponseMessage(agentName, response);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain(response);
      expect(JSON.stringify(result)).toContain(agentName);
    });

    it('should create agent response with share button when channel provided', () => {
      const agentName = 'Support Agent';
      const response = 'Here is your answer.';
      const channelId = 'C123ABC';

      const result = createAgentResponseMessage(agentName, response, channelId);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Share to Channel');
      expect(JSON.stringify(result)).toContain('share_to_channel');
    });

    it('should truncate long responses for share button value', () => {
      const agentName = 'Agent';
      const longResponse = 'x'.repeat(2000);
      const channelId = 'C123';

      const result = createAgentResponseMessage(agentName, longResponse, channelId);

      expect(JSON.stringify(result)).toContain('...');
    });
  });

  describe('createSettingsMessage', () => {
    it('should create settings message with default agent', () => {
      const currentConfig = {
        agentId: 'agent-1',
        agentName: 'My Default Agent',
        source: 'workspace',
      };
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createSettingsMessage(currentConfig, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Your /inkeep Settings');
      expect(JSON.stringify(result)).toContain('My Default Agent');
      expect(JSON.stringify(result)).toContain('Workspace default (admin-set)');
    });

    it('should show not configured when no default agent', () => {
      const result = createSettingsMessage(null, 'https://app.inkeep.com');

      expect(JSON.stringify(result)).toContain('No default agent configured');
    });
  });

  describe('createSettingsUpdatedMessage', () => {
    it('should create settings updated message', () => {
      const agentName = 'New Agent';

      const result = createSettingsUpdatedMessage(agentName);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Settings Updated');
      expect(JSON.stringify(result)).toContain(agentName);
    });
  });

  describe('createAgentListMessage', () => {
    it('should create agent list message', () => {
      const agents = [
        { id: 'agent-1', name: 'Support Agent', projectName: 'Main Project' },
        { id: 'agent-2', name: 'Sales Agent', projectName: null },
        { id: 'agent-3', name: null, projectName: 'Other Project' },
      ];
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createAgentListMessage(agents, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Available Agents');
      expect(JSON.stringify(result)).toContain('Support Agent');
      expect(JSON.stringify(result)).toContain('Main Project');
    });

    it('should show more text when agents exceed 15', () => {
      const agents = Array.from({ length: 20 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        projectName: 'Project',
      }));

      const result = createAgentListMessage(agents, 'https://app.inkeep.com');

      expect(JSON.stringify(result)).toContain('and 5 more');
    });
  });

  describe('createNoDefaultAgentMessage', () => {
    it('should create no default agent message', () => {
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createNoDefaultAgentMessage(dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('No Default Agent Configured');
      expect(JSON.stringify(result)).toContain('/inkeep list');
      expect(JSON.stringify(result)).toContain('/inkeep settings');
    });
  });

  describe('createThinkingMessage', () => {
    it('should create thinking message with agent name', () => {
      const agentName = 'Support Agent';

      const result = createThinkingMessage(agentName);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('thinking');
      expect(JSON.stringify(result)).toContain(agentName);
    });
  });

  describe('createUpdatedHelpMessage', () => {
    it('should create comprehensive help message', () => {
      const result = createUpdatedHelpMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Two Ways to Ask Questions');
      expect(JSON.stringify(result)).toContain('@Inkeep');
      expect(JSON.stringify(result)).toContain('/inkeep run');
      expect(JSON.stringify(result)).toContain('Commands');
      expect(JSON.stringify(result)).toContain('settings');
    });
  });

  describe('createDeviceCodeMessage', () => {
    it('should create device code message', () => {
      const code = 'ABCD-1234';
      const linkUrl = 'https://app.inkeep.com/link?code=ABCD-1234';
      const expiresInMinutes = 60;

      const result = createDeviceCodeMessage(code, linkUrl, expiresInMinutes);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Link your Inkeep account');
      expect(JSON.stringify(result)).toContain(code);
      expect(JSON.stringify(result)).toContain('60 minutes');
    });
  });

  describe('createLinkSuccessMessage', () => {
    it('should create link success message', () => {
      const email = 'test@example.com';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createLinkSuccessMessage(email, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Account Linked');
      expect(JSON.stringify(result)).toContain(email);
    });
  });

  describe('createLinkExpiredMessage', () => {
    it('should create link expired message', () => {
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createLinkExpiredMessage(dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Code Expired');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });

  describe('createAlreadyLinkedMessage', () => {
    it('should create already linked message', () => {
      const email = 'test@example.com';
      const linkedAt = '2026-01-25T12:00:00Z';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createAlreadyLinkedMessage(email, linkedAt, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Already Linked');
      expect(JSON.stringify(result)).toContain(email);
      expect(JSON.stringify(result)).toContain('/inkeep unlink');
    });
  });

  describe('createUnlinkSuccessMessage', () => {
    it('should create unlink success message', () => {
      const result = createUnlinkSuccessMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Account Unlinked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });

  describe('createNotLinkedMessage', () => {
    it('should create not linked message', () => {
      const result = createNotLinkedMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Not Linked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });
});
