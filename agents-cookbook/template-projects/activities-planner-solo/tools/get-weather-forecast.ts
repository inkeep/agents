import { functionTool } from '@inkeep/agents-sdk';

export const getWeatherForecast = functionTool({
	name: 'get-weather-forecast',
	description: 'Get an hourly weather forecast for the next 24 hours given geographic coordinates',
	inputSchema: {
		type: 'object',
		properties: {
			latitude: {
				type: 'number',
				description: 'Latitude of the location',
			},
			longitude: {
				type: 'number',
				description: 'Longitude of the location',
			},
		},
		required: ['latitude', 'longitude'],
	},
	execute: async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
		const baseTemp = 18 + Math.round(latitude * 0.1) % 15;
		const conditions = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Clear'];
		const hours = Array.from({ length: 24 }, (_, i) => {
			const hour = (8 + i) % 24;
			const period = hour >= 12 ? 'PM' : 'AM';
			const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
			return {
				time: `${displayHour}${period}`,
				temperature: baseTemp + Math.round(Math.sin((i / 24) * Math.PI * 2) * 6),
				conditions: conditions[i % conditions.length],
				precipitation: i % 4 === 3 ? 30 : 0,
				humidity: 50 + (i % 3) * 10,
				windSpeed: 5 + (i % 5) * 3,
			};
		});

		return {
			location: { latitude, longitude },
			forecast: hours,
			summary: `Forecast generated for coordinates (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
		};
	},
});
