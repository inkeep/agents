import { agent, subAgent, functionTool } from "@inkeep/agents-sdk";
import { activities } from "../data-components/activities";
import { citation } from "../artifact-components/citation";
import { exaMcpTool } from "../tools/exa-mcp";
import { weatherMcpTool } from "../tools/weather-mcp";

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

const calculateActivityScore = functionTool({
  name: "calculate-activity-score",
  description: "Calculate a score for an activity based on weather conditions",
  inputSchema: {
    type: "object",
    properties: {
      activityType: {
        type: "string",
        description: "Type of activity (e.g., 'outdoor', 'indoor', 'water')",
      },
      temperature: {
        type: "number",
        description: "Temperature in Celsius",
      },
      precipitation: {
        type: "number",
        description: "Precipitation probability (0-100)",
      },
    },
    required: ["activityType", "temperature", "precipitation"],
  },
  execute: async ({ activityType, temperature, precipitation }) => {
    let score = 50; // base score

    // Adjust score based on activity type and weather
    if (activityType === "outdoor") {
      if (temperature >= 15 && temperature <= 30 && precipitation < 30) {
        score = 90;
      } else if (precipitation > 50) {
        score = 20;
      }
    } else if (activityType === "indoor") {
      score = 80; // Indoor activities less affected by weather
    }

    return {
      score,
      recommendation: score >= 70 ? "Recommended" : "Not recommended",
    };
  },
});

const activitiesPlanner = subAgent({
  id: "activities-planner",
  name: "Activities planner",
  description:
    "Responsible for routing between the coordinates agent, weather forecast agent, and websearch agent",
  prompt:
    "You are a proactive, helpful assistant. When the user asks about activities in a given location, first ask the coordinates agent for the coordinates, and then pass those coordinates to the weather forecast agent to get the weather forecast. Then based on the weather forecast, ask the websearch MCP tool to search the web for good activities given the weather. Once you have the activities, use the calculate-activity-score tool to calculate a score for one of the activities based on the weather conditions- and then show the user the activity score in your response. When you receive web search results, create citation artifacts to document your sources.",
  canDelegateTo: () => [weatherForecaster, coordinatesAgent],
  canUse: () => [
    calculateActivityScore,
    exaMcpTool.with({ selectedTools: ["web_search_exa"] }),
  ],
  dataComponents: () => [activities],
  artifactComponents: () => [citation],
});

const weatherForecaster = subAgent({
  id: "weather-forecaster",
  name: "Weather forecaster",
  description:
    "This agent is responsible for taking in coordinates and returning the forecast for the weather at that location",
  prompt:
    "You are a helpful assistant responsible for taking in coordinates and returning the forecast for that location using your forecasting tool",
  canUse: () => [
    weatherMcpTool.with({
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
  canUse: () => [weatherMcpTool.with({ selectedTools: ["get_coordinates"] })],
});

// Agent
export const activitiesPlannerAdvancedAgent = agent({
  id: "activities-planner-advanced",
  name: "Activities planner advanced",
  description:
    "Plans activities for any location based on 24-hour weather forecasts",
  defaultSubAgent: activitiesPlanner,
  subAgents: () => [activitiesPlanner, weatherForecaster, coordinatesAgent],
  statusUpdates: {
    numEvents: 3,
  },
});
