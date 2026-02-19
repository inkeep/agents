import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherMcpTool } from '../tools/weather-mcp';
import { supportContext } from '../context-configs/support-context';
import { githubWebhook } from './triggers/github-webhook';
import { toolSummary } from '../status-components/tool-summary';

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
  triggers: () => [githubWebhook],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config]
  }
});
