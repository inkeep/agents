import { agent, subAgent } from '@inkeep/agents-sdk';
import { activities } from '../data-components/activities';
import { getCoordinates } from '../tools/get-coordinates';
import { getWeatherForecast } from '../tools/get-weather-forecast';

/**
 * Activities Planner Solo Agent
 *
 * A fully offline variant of the activities planner that uses functionTool()
 * instead of mcpTool() — no network access required.
 *
 * This agent works by:
 * 1. Using the coordinates agent to get the coordinates of the specified location
 * 2. Passing those coordinates to the weather forecast agent to get the weather forecast
 * 3. Suggesting activities based on the weather conditions
 *
 * Example usage:
 * "What are some good activities in Tokyo?"
 * "What are some fun events in Boston?"
 */

const activitiesPlanner = subAgent({
	id: 'activities-planner',
	name: 'Activities planner',
	description: 'Responsible for routing between the coordinates agent and weather forecast agent',
	prompt:
		'You are a helpful assistant. When the user asks about activities in a given location, first ask the coordinates agent for the coordinates, and then pass those coordinates to the weather forecast agent to get the weather forecast. Then based on the weather forecast, suggest good activities for the conditions.',
	canDelegateTo: () => [weatherForecaster, coordinatesAgent],
	dataComponents: () => [activities],
});

const weatherForecaster = subAgent({
	id: 'weather-forecaster',
	name: 'Weather forecaster',
	description:
		'This agent is responsible for taking in coordinates and returning the forecast for the weather at that location',
	prompt:
		'You are a helpful assistant responsible for taking in coordinates and returning the forecast for that location using your forecasting tool',
	canUse: () => [getWeatherForecast],
});

const coordinatesAgent = subAgent({
	id: 'get-coordinates-agent',
	name: 'Coordinates agent',
	description: 'Responsible for converting location or address into coordinates',
	prompt:
		'You are a helpful assistant responsible for converting location or address into coordinates using your coordinate converter tool',
	canUse: () => [getCoordinates],
});

export const activitiesPlannerSoloAgent = agent({
	id: 'activities-planner-solo',
	name: 'Activities planner solo',
	description: 'Plans activities for any location based on weather forecasts — fully offline, no network required',
	defaultSubAgent: activitiesPlanner,
	subAgents: () => [activitiesPlanner, weatherForecaster, coordinatesAgent],
});
