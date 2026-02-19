import { functionTool } from '@inkeep/agents-sdk';

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  tokyo: { lat: 35.6762, lon: 139.6503 },
  boston: { lat: 42.3601, lon: -71.0589 },
  'new york': { lat: 40.7128, lon: -74.006 },
  london: { lat: 51.5074, lon: -0.1278 },
  paris: { lat: 48.8566, lon: 2.3522 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  sydney: { lat: -33.8688, lon: 151.2093 },
};

export const getCoordinates = functionTool({
  name: 'get-coordinates',
  description:
    'Convert a location name or address into geographic coordinates (latitude and longitude)',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city name, address, or location to geocode',
      },
    },
    required: ['location'],
  },
  execute: async ({ location }: { location: string }) => {
    const key = location.toLowerCase().trim();
    const match = CITY_COORDINATES[key];
    if (match) {
      return { latitude: match.lat, longitude: match.lon, name: location, found: true };
    }
    return {
      latitude: 40.7128,
      longitude: -74.006,
      name: `${location} (defaulted to New York)`,
      found: false,
    };
  },
});
