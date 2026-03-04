// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for MCP tool generator
 */

import { generateMcpToolDefinition as originalGenerateMcpToolDefinition } from '../generators/mcp-tool-generator';
import { expectSnapshots } from '../utils';

function generateMcpToolDefinition(
  ...args: Parameters<typeof originalGenerateMcpToolDefinition>
): string {
  return originalGenerateMcpToolDefinition(...args).getFullText();
}

// Mock envSettings for tests
const envSettings = {
  getEnvironmentCredential: (key: string) => `mock-credential-${key}`,
};

describe('MCP Tool Generator', () => {
  const testToolData = {
    name: 'Weather',
    description: 'Get weather information from external API',
    config: {
      mcp: {
        server: {
          url: 'https://mcp.cloud.inkeep.com/weather/mcp',
        },
        transport: {
          type: 'streamable_http',
        },
      },
    },
    imageUrl:
      'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp',
  };

  const testToolWithCredential = {
    name: 'Stripe',
    description: 'Stripe payment processing integration',
    config: {
      mcp: {
        server: {
          url: 'https://stripe-mcp-hazel.vercel.app/mcp',
        },
        transport: {
          type: 'streamable_http',
        },
      },
    },
    credential: envSettings.getEnvironmentCredential('stripe_api_key'),
  };

  describe('generateMcpToolDefinition', () => {
    it('should generate correct definition with all properties', async () => {
      const mcpToolId = 'weather-mcp';
      const definition = generateMcpToolDefinition({ mcpToolId, ...testToolData });

      expect(definition).toContain('export const weatherMcp = mcpTool({');
      expect(definition).toContain("id: 'weather-mcp',");
      expect(definition).toContain("name: 'Weather',");
      expect(definition).toContain("serverUrl: 'https://mcp.cloud.inkeep.com/weather/mcp',");
      expect(definition).toContain("description: 'Get weather information from external API',");
      expect(definition).toContain(
        "imageUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp'"
      );
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle tool ID to camelCase conversion', async () => {
      const mcpToolId = 'stripe-payment-tool';
      const conversionData = {
        name: 'Stripe Payment',
        config: {
          mcp: {
            server: {
              url: 'https://stripe.example.com/mcp',
            },
            transport: { type: 'streamable_http' },
          },
        },
      };
      const definition = generateMcpToolDefinition({ mcpToolId, ...conversionData });

      expect(definition).toContain('export const stripePaymentTool = mcpTool({');
      expect(definition).toContain("id: 'stripe-payment-tool',");
      await expectSnapshots(definition);
    });

    it.skip('should throw error for missing name', () => {
      expect(() => {
        generateMcpToolDefinition('my-mcp-tool', {
          serverUrl: 'https://example.com/mcp',
          description: 'Tool without explicit name',
        });
      }).toThrow("Missing required fields for MCP tool 'my-mcp-tool': name");
    });

    it.skip('should throw error for missing serverUrl', () => {
      expect(() => {
        generateMcpToolDefinition('no-server', { name: 'No Server Tool' });
      }).toThrow("Missing required fields for MCP tool 'no-server': serverUrl");
    });

    it('should handle credential as direct reference', async () => {
      const mcpToolId = 'stripe-mcp';
      const definition = generateMcpToolDefinition({ mcpToolId, ...testToolWithCredential });

      expect(definition).toContain('credential: mock-credential-stripe_api_key');
      await expectSnapshots(definition);
    });

    it('should handle credential as object', async () => {
      const mcpToolId = 'api-tool';
      const toolWithObjectCredential = {
        name: 'API Tool',
        config: {
          mcp: {
            server: {
              url: 'https://api.example.com/mcp',
            },
            transport: { type: 'streamable_http' },
          },
        },
        credential: {
          type: 'api_key',
          value: 'my-api-key',
        },
      };

      const definition = generateMcpToolDefinition({ mcpToolId, ...toolWithObjectCredential });

      expect(definition).toContain("credential: { type: 'api_key', value: 'my-api-key' },");
      await expectSnapshots(definition);
    });

    it.skip('should throw error for missing required fields', () => {
      expect(() => {
        generateMcpToolDefinition('minimal');
      }).toThrow("Missing required fields for MCP tool 'minimal': name, serverUrl");
    });

    it('should handle multiline descriptions', async () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information about the MCP tool functionality';
      const mcpToolId = 'detailed';
      const dataWithLongDesc = {
        name: 'detailed-mcp-tool',
        serverUrl: 'https://detailed.example.com/mcp',
        description: longDescription,
      };

      const definition = generateMcpToolDefinition({ mcpToolId, ...dataWithLongDesc });

      expect(definition).toContain(`description: '${longDescription}'`);
      await expectSnapshots(definition);
    });

    it('should handle special characters in URLs', async () => {
      const mcpToolId = 'special';
      const toolData = {
        name: 'Special Tool',
        config: {
          mcp: {
            server: {
              url: 'https://api.example.com/mcp?key=value&param=test',
            },
            transport: {
              type: 'streamable_http',
            },
          },
        },
        imageUrl: 'https://images.example.com/icon.png?size=256&format=webp',
      };

      const definition = generateMcpToolDefinition({ mcpToolId, ...toolData });

      expect(definition).toContain(
        "serverUrl: 'https://api.example.com/mcp?key=value&param=test',"
      );
      expect(definition).toContain(
        "imageUrl: 'https://images.example.com/icon.png?size=256&format=webp'"
      );
      await expectSnapshots(definition);
    });
  });

  describe('generateMcpToolFile', () => {
    it('should generate complete file with direct credential', async () => {
      const mcpToolId = 'stripe-mcp';
      const file = generateMcpToolDefinition({ mcpToolId, ...testToolWithCredential });

      expect(file).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(file).not.toContain('import { envSettings }');
      expect(file).toContain('export const stripeMcp = mcpTool({');
      expect(file).toContain('credential: mock-credential-stripe_api_key');
      await expectSnapshots(file);
    });
  });

  describe('compilation tests', () => {
    it.skip('should throw error for minimal MCP tool without required fields', () => {
      const minimalData = {};

      expect(() => {
        generateMcpToolDefinition('minimal-mcp', minimalData);
      }).toThrow("Missing required fields for MCP tool 'minimal-mcp': name, serverUrl");
    });
  });

  describe('edge cases', () => {
    it.skip('should throw error for empty tool data', () => {
      expect(() => {
        generateMcpToolDefinition('empty', {});
      }).toThrow("Missing required fields for MCP tool 'empty': name, serverUrl");
    });

    it('should handle invalid URLs gracefully', async () => {
      const mcpToolId = 'invalid';
      const toolData = {
        name: 'Invalid URL Tool',
        config: {
          mcp: {
            server: {
              url: 'not-a-valid-url',
            },
            transport: { type: 'streamable_http' },
          },
        },
        imageUrl: 'also-not-valid',
      };

      const definition = generateMcpToolDefinition({ mcpToolId, ...toolData });

      expect(definition).toContain("serverUrl: 'not-a-valid-url',");
      expect(definition).toContain("imageUrl: 'also-not-valid'");
      await expectSnapshots(definition);
    });

    it('should handle null and undefined values gracefully', async () => {
      const mcpToolId = 'null-tool';
      const toolData = {
        name: 'Null Tool',
        serverUrl: 'https://example.com/mcp',
        description: null,
        imageUrl: undefined,
        credential: null,
      };

      const definition = generateMcpToolDefinition({ mcpToolId, ...toolData });

      expect(definition).toContain('export const nullTool = mcpTool({');
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('imageUrl:');
      expect(definition).not.toContain('credential:');
      await expectSnapshots(definition);
    });

    it.skip('should throw error for missing name only', () => {
      expect(() => {
        generateMcpToolDefinition('missing-name', { serverUrl: 'https://example.com/mcp' });
      }).toThrow("Missing required fields for MCP tool 'missing-name': name");
    });

    it.skip('should throw error for missing serverUrl only', () => {
      expect(() => {
        generateMcpToolDefinition('missing-server', { name: 'Missing Server Tool' });
      }).toThrow("Missing required fields for MCP tool 'missing-server': serverUrl");
    });
  });
});
