import { createDatabaseClient } from '../db/client';
import type { DataComponentInsert } from '../types';
import { createDataComponent } from './dataComponents';
import { createProject } from './projects';

const db = createDatabaseClient();

const main = async () => {
  // First, create the project that the data component will reference
  try {
    await createProject(db)({
      id: 'test',
      tenantId: 'default',
      name: 'Test Project',
      description: 'A project for weather forecasting',
      models: {
        base: {},
      },
    });
    console.log('Project created successfully');
  } catch (error) {
    // Project might already exist, that's okay
    console.log('Project creation skipped (may already exist)');
  }

  const params: DataComponentInsert = {
    id: 'weather-test-2',
    tenantId: 'default',
    projectId: 'test',
    render: null,
    name: 'WeatherForecast',
    description: 'A hourly forecast for the weather at a given location',
    props: {
      type: 'object',
      properties: {
        forecast: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: {
                type: 'string',
                description: 'The time of current item E.g. 12PM, 1PM',
              },
              temperature: {
                type: 'number',
                description: 'The temperature at given time in Farenheit',
              },
              code: {
                type: 'number',
                description: 'Weather code at given time',
              },
            },
            required: ['time', 'temperature', 'code'],
          },
        },
      },
      required: ['forecast'],
    },
  };

  const result = await createDataComponent(db)(params);
  console.log('Data component created:', result);
};

main();
