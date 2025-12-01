import { dataComponent } from '@inkeep/agents-sdk';

export const runeHolderStats = dataComponent({
  id: 'rune-holder-stats',
  name: 'RuneHolderStats',
  description: 'Displays comprehensive holder statistics and distribution metrics for a Rune token',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      stats: {
        type: 'object',
        properties: {
          runeName: {
            type: 'string',
            description: 'The Rune token name (e.g., DOG•GO•TO•THE•MOON)',
          },
          runeId: {
            type: 'string',
            description: 'The Rune ID (e.g., 840000:3)',
          },
          totalHolders: {
            type: 'string',
            description: 'Total number of unique holders (e.g., 92,127)',
          },
          circulatingSupply: {
            type: 'string',
            description: 'Total circulating supply (e.g., 99,976,513,067.83 DOG)',
          },
          averageBalance: {
            type: 'object',
            properties: {
              tokens: {
                type: 'string',
                description: 'Average tokens per holder (e.g., 1,085,491 DOG)',
              },
              usd: {
                type: 'string',
                description: 'Average USD value per holder (e.g., ~$6,622)',
              },
            },
            required: ['tokens', 'usd'],
          },
          topHolderConcentration: {
            type: 'object',
            properties: {
              percentage: {
                type: 'string',
                description: 'Top holder percentage of supply (e.g., 0.0036%)',
              },
              status: {
                type: 'string',
                description: 'Concentration status (e.g., Very distributed, No whale dominance)',
              },
            },
            required: ['percentage', 'status'],
          },
          distributionHealth: {
            type: 'object',
            properties: {
              decentralization: {
                type: 'string',
                description: 'Decentralization rating (e.g., Excellent)',
              },
              communityAdoption: {
                type: 'string',
                description: 'Community adoption level (e.g., Broad - 92K+ addresses)',
              },
              sustainability: {
                type: 'string',
                description: 'Sustainability assessment (e.g., Well-distributed supply)',
              },
            },
            required: ['decentralization', 'communityAdoption', 'sustainability'],
          },
          priceInfo: {
            type: 'object',
            properties: {
              currentPrice: {
                type: 'string',
                description: 'Current token price (e.g., ~$0.0061 USD / 6.56 sats)',
              },
              btcPrice: {
                type: 'string',
                description: 'Current BTC price (e.g., $93,300)',
              },
            },
            required: ['currentPrice', 'btcPrice'],
          },
        },
        required: [
          'runeName',
          'runeId',
          'totalHolders',
          'circulatingSupply',
          'averageBalance',
          'topHolderConcentration',
          'distributionHealth',
          'priceInfo',
        ],
      },
    },
    required: ['stats'],
  },
});
