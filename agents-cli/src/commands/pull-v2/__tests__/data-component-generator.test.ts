import { describe, expect, it } from 'vitest';
import { generateDataComponentFile, DEFAULT_CODE_STYLE } from '../data-component-generator';

describe('data-component-generator', () => {
  describe('generateDataComponentFile', () => {
    it('should generate a basic data component file', () => {
      const componentData = {
        id: 'weather-forecast',
        name: 'WeatherForecast',
        description: 'A hourly forecast for the weather at a given location',
        props: {
          type: 'object',
          properties: {
            forecast: {
              type: 'array',
              description: 'The hourly forecast for the weather at a given location',
              items: {
                type: 'object',
                properties: {
                  time: {
                    type: 'string',
                    description: 'The time of current item E.g. 12PM, 1PM'
                  },
                  temperature: {
                    type: 'number',
                    description: 'The temperature at given time in Farenheit'
                  },
                  code: {
                    type: 'number',
                    description: 'Weather code at given time'
                  }
                }
              }
            }
          }
        }
      };

      const result = generateDataComponentFile('weather-forecast', componentData);

      expect(result).toContain("import { dataComponent } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("export const weatherForecast = dataComponent({");
      expect(result).toContain("id: 'weather-forecast',");
      expect(result).toContain("name: 'WeatherForecast',");
      expect(result).toContain("description: 'A hourly forecast for the weather at a given location',");
      expect(result).toContain("props: z.object({");
      expect(result).toContain("forecast: z.array(");
      expect(result).toContain("time: z.string().describe(`The time of current item E.g. 12PM, 1PM`),");
      expect(result).toContain("temperature: z.number().describe(`The temperature at given time in Farenheit`),");
      expect(result).toContain("code: z.number().describe(`Weather code at given time`),");
    });

    it('should handle data component without description', () => {
      const componentData = {
        id: 'simple-data',
        name: 'SimpleData',
        props: {
          type: 'object',
          properties: {
            value: {
              type: 'string'
            }
          }
        }
      };

      const result = generateDataComponentFile('simple-data', componentData);

      expect(result).toContain("export const simpleData = dataComponent({");
      expect(result).toContain("id: 'simple-data',");
      expect(result).toContain("name: 'SimpleData',");
      expect(result).not.toContain("description:");
      expect(result).toContain("props: z.object({");
      expect(result).toContain("value: z.string(),");
    });

    it('should handle data component without props/schema', () => {
      const componentData = {
        id: 'no-schema',
        name: 'No Schema Component',
        description: 'A component without schema'
      };

      const result = generateDataComponentFile('no-schema', componentData);

      expect(result).toContain("import { dataComponent } from '@inkeep/agents-sdk';");
      expect(result).not.toContain("import { z } from 'zod';");
      expect(result).toContain("export const noSchema = dataComponent({");
      expect(result).not.toContain("props:");
    });

    it('should use schema field if props is not available', () => {
      const componentData = {
        id: 'alt-schema',
        name: 'Alt Schema',
        schema: {
          type: 'object',
          properties: {
            data: {
              type: 'string'
            }
          }
        }
      };

      const result = generateDataComponentFile('alt-schema', componentData);

      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("props: z.object({");
      expect(result).toContain("data: z.string(),");
    });

    it('should use double quotes when configured', () => {
      const componentData = {
        id: 'test-component',
        name: 'Test Component',
        props: {
          type: 'object',
          properties: {
            test: { type: 'string' }
          }
        }
      };

      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateDataComponentFile('test-component', componentData, style);

      expect(result).toContain('import { dataComponent } from "@inkeep/agents-sdk";');
      expect(result).toContain('name: "Test Component",');
    });

    it('should handle complex nested schemas', () => {
      const componentData = {
        id: 'complex-schema',
        name: 'Complex Schema',
        props: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'User name' },
                  age: { type: 'number', description: 'User age' },
                  active: { type: 'boolean' }
                }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                version: { type: 'string' },
                timestamp: { type: 'number' }
              }
            }
          }
        }
      };

      const result = generateDataComponentFile('complex-schema', componentData);

      expect(result).toContain("users: z.array(z.object({");
      expect(result).toContain("name: z.string().describe(`User name`),");
      expect(result).toContain("age: z.number().describe(`User age`),");
      expect(result).toContain("active: z.boolean(),");
      expect(result).toContain("metadata: z.object({");
      expect(result).toContain("version: z.string(),");
      expect(result).toContain("timestamp: z.number(),");
    });

    it('should handle different ID formats', () => {
      expect(generateDataComponentFile('weather-forecast', { name: 'Test' }))
        .toContain('export const weatherForecast =');
      
      expect(generateDataComponentFile('weather_forecast', { name: 'Test' }))
        .toContain('export const weatherForecast =');
      
      expect(generateDataComponentFile('WeatherForecast', { name: 'Test' }))
        .toContain('export const weatherforecast =');
    });
  });
});