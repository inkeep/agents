import { agent, subAgent, agentMcp } from "@inkeep/agents-sdk";
import { weatherMcpTool } from "../tools/weather-mcp";
import { exaMcpTool } from "../tools/exa-mcp";
import { activities } from "../data-components/activities";

/**
 * Activities Planner Agent
 *
 * This agent helps plan events in a given location by considering the weather forecast.
 *
 * This agent works by:
 * 1. Using the coordinates agent to get the coordinates of the specified location
 * 2. Passing those coordinates to the weather forecast agent to get the weather forecast for the next 24 hours
 * 3. Using the websearch agent to find good events based on the weather conditions
 *
 * Example usage:
 * "What are some good events in Tokyo?"
 * "What are some fun activities in Boston?"
 */

const activitiesPlanner = subAgent({
  id: "activities-planner",
  name: "Activities planner",
  description:
    "Responsible for routing between the coordinates agent, weather forecast agent, and websearch agent",
  prompt:
    "You are a helpful assistant. When the user asks about activities in a given location, first ask the coordinates agent for the coordinates, and then pass those coordinates to the weather forecast agent to get the weather forecast. Then based on the weather forecast, ask the websearch agent to search the web for good activities given the weather.",
  canDelegateTo: () => [weatherForecaster, coordinatesAgent, websearchAgent],
  dataComponents: () => [activities],
});

const weatherForecaster = subAgent({
  id: "weather-forecaster",
  name: "Weather forecaster",
  description:
    "This agent is responsible for taking in coordinates and returning the forecast for the weather at that location",
  prompt:
    "You are a helpful assistant responsible for taking in coordinates and returning the forecast for that location using your forecasting tool",
  canUse: () => [
    agentMcp({
      server: weatherMcpTool,
      selectedTools: ["get_weather_forecast"],
    }),
  ],
});

const coordinatesAgent = subAgent({
  id: "get-coordinates-agent",
  name: "Coordinates agent",
  description:
    "Responsible for converting location or address into coordinates",
  prompt:
    "You are a helpful assistant responsible for converting location or address into coordinates using your coordinate converter tool",
  canUse: () => [
    agentMcp({ server: weatherMcpTool, selectedTools: ["get_coordinates"] }),
  ],
});

const websearchAgent = subAgent({
  id: "websearch-agent",
  name: "Websearch agent",
  description: "Responsible for searching the web for information",
  prompt:
    "You are a helpful assistant responsible for searching the web for information using your websearch tool",
  canUse: () => [
    agentMcp({ server: exaMcpTool, selectedTools: ["web_search_exa"] }),
  ],
});

// Agent
export const activitiesPlannerAgent = agent({
  id: "activities-planner",
  name: "Activities planner",
  description:
    "Plans activities for any location based on 24-hour weather forecasts",
  defaultSubAgent: activitiesPlanner,
  subAgents: () => [
    activitiesPlanner,
    weatherForecaster,
    coordinatesAgent,
    websearchAgent,
  ],
});
