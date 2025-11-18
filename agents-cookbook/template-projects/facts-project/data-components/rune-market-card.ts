import { dataComponent } from '@inkeep/agents-sdk';

export const runeMarketCard = dataComponent({
  id: 'rune-market-card',
  name: 'RuneMarketCard',
  description:
    'Displays comprehensive market data for a Rune token including current price, volume, and trading statistics',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      rune: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The Rune token name (e.g., DOG•GO•TO•THE•MOON)',
          },
          runeId: {
            type: 'string',
            description: 'The Rune ID (e.g., 840000:3)',
          },
          currentPrice: {
            type: 'object',
            properties: {
              usd: {
                type: 'string',
                description: 'Current price in USD (e.g., $0.0061)',
              },
              sats: {
                type: 'string',
                description: 'Current price in satoshis (e.g., 6.56 sats)',
              },
            },
            required: ['usd', 'sats'],
          },
          btcPrice: {
            type: 'string',
            description: 'Current BTC price in USD (e.g., $93,300)',
          },
          volume24h: {
            type: 'object',
            properties: {
              tokens: {
                type: 'string',
                description: 'Token volume (e.g., 75.35M+ DOG tokens)',
              },
              usd: {
                type: 'string',
                description: 'USD volume estimate (e.g., ~$460,000)',
              },
              tradeCount: {
                type: 'string',
                description: 'Number of trades (e.g., 100+)',
              },
            },
            required: ['tokens', 'usd', 'tradeCount'],
          },
          priceRange24h: {
            type: 'object',
            properties: {
              low: {
                type: 'string',
                description: 'Lowest price (e.g., ~6.16 sats / $0.0058)',
              },
              high: {
                type: 'string',
                description: 'Highest price (e.g., ~7.35 sats / $0.0069)',
              },
              range: {
                type: 'string',
                description: 'Price range percentage (e.g., ~18%)',
              },
            },
            required: ['low', 'high', 'range'],
          },
          tradingActivity: {
            type: 'object',
            properties: {
              primaryDexs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Primary DEXs (e.g., ["Magic Eden", "DotSwap"])',
              },
              liquidity: {
                type: 'string',
                description: 'Liquidity description (e.g., Active on both major Rune exchanges)',
              },
              averageTradeSize: {
                type: 'string',
                description: 'Average trade size range (e.g., 1,000 to 750,000+ tokens)',
              },
            },
          },
          timestamp: {
            type: 'string',
            description: 'Data timestamp (e.g., January 1, 2025)',
          },
        },
        required: [
          'name',
          'runeId',
          'currentPrice',
          'btcPrice',
          'volume24h',
          'priceRange24h',
          'timestamp',
        ],
      },
    },
    required: ['rune'],
  },
});
