import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const weatherForecast = dataComponent({
  id: 'weather-forecast',
  name: `WeatherForecast`,
  description: `A hourly forecast for the weather at a given location`,
  props: z.object({
    forecast: z.array(
      z.object({
        time: z.string().describe(`The time of current item E.g. 12PM, 1PM`),
        temperature: z.number().describe(`The temperature at given time in Farenheit`),
        code: z.number().describe(`Weather code at given time`)
      })
    ).describe(`The hourly forecast for the weather at a given location`)
  })
});