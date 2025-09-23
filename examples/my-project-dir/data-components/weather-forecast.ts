import { dataComponent } from '@inkeep/agents-sdk';

export const weatherForecast = dataComponent({
  name: 'WeatherForecast',
  description: 'A hourly forecast for the weather at a given location',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      forecast: {
        description: 'The hourly forecast for the weather at a given location',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: {
              description: 'The time of current item E.g. 12PM, 1PM',
              type: 'string'
            },
            temperature: {
              description: 'The temperature at given time in Farenheit',
              type: 'number'
            },
            code: {
              description: 'Weather code at given time',
              type: 'number'
            }
          },
          required: [
            'time',
            'temperature',
            'code'
          ],
          additionalProperties: false
        }
      }
    },
    required: [
      'forecast'
    ],
    additionalProperties: false
  }
});