import { dataComponent } from '@inkeep/agents-sdk';

export const topHoldersList = dataComponent({
  id: 'top-holders-list',
  name: 'TopHoldersList',
  description: 'Displays a ranked list of the top holders for a Rune token with balances and USD values',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      holders: {
        type: 'object',
        properties: {
          runeName: {
            type: 'string',
            description: 'The Rune token name (e.g., DOG•GO•TO•THE•MOON)'
          },
          topHolders: {
            type: 'array',
            description: 'Array of top holder addresses with their balances',
            items: {
              type: 'object',
              properties: {
                rank: {
                  type: 'number',
                  description: 'Holder rank (1-based)'
                },
                address: {
                  type: 'string',
                  description: 'Bitcoin address (e.g., bc1p2znw3ad6k...)'
                },
                balance: {
                  type: 'string',
                  description: 'Token balance (e.g., 3,559,224.00000 DOG)'
                },
                usdValue: {
                  type: 'string',
                  description: 'USD value (e.g., ~$21,711)'
                },
                percentOfSupply: {
                  type: 'string',
                  description: 'Percentage of total supply (e.g., 0.0036%)'
                }
              },
              required: ['rank', 'address', 'balance', 'usdValue', 'percentOfSupply']
            },
            minItems: 1,
            maxItems: 10
          },
          priceInfo: {
            type: 'object',
            properties: {
              tokenPrice: {
                type: 'string',
                description: 'Current token price (e.g., ~$0.0061 USD / 6.56 sats)'
              },
              btcPrice: {
                type: 'string',
                description: 'Current BTC price (e.g., $93,300)'
              }
            },
            required: ['tokenPrice', 'btcPrice']
          }
        },
        required: ['runeName', 'topHolders', 'priceInfo']
      }
    },
    required: ['holders']
  }
});
