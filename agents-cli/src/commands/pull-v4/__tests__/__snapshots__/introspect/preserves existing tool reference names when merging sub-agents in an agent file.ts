import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherMcpTool } from '../tools/weather-mcp';
import { supportContext } from '../context-configs/support-context';
import { githubWebhookTrigger } from './triggers/git-hub-webhook';
import { toolSummary } from '../status-components/tool_summary';

const weatherForecasterCustom = subAgent({
  id: 'weather-forecaster',
  name: 'Weather forecaster',
  canUse: () => [weatherMcpTool.with({ selectedTools: ['get_weather_forecast'] })]
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: weatherForecasterCustom,
  subAgents: () => [weatherForecasterCustom],
  contextConfig: supportContext,
  triggers: () => [githubWebhookTrigger],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config],
  }
});
