import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const activities = dataComponent({
  id: 'activities',
  name: `Activities`,
  description: `A list of activities`,
  props: z.object({
    activities: z.array(
      z.object({
        title: z.string().describe(`The main title of the event or activity category`),
        category: z.enum(['Festival', 'Fitness', 'Outdoor Activity', 'Market', 'Tour', 'Other']).describe(`The type of event`),
        description: z.string().describe(`A brief description of the event`),
        details: z.object({
          dates: z.string().optional(),
          time: z.string().optional(),
          location: z.string().optional()
        }).optional().describe(`Specific details like dates, time, and location`),
        subItems: z.array(z.string()).optional().describe(`A list of sub-points or examples, like different parks for hiking`)
      })
    ).describe(`The list of activities`)
  })
});
