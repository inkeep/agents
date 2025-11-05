/**
 * Unit tests for MCP tool generator
 */

import { describe, expect, it } from 'vitest';
import {
  generateMcpToolDefinition,
  generateMcpToolFile,
  generateMcpToolImports,
} from '../mcp-tool-generator';

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
          url: 'https://weather-mcp-hazel.vercel.app/mcp'
        },
        transport: {
          type: 'streamable_http'
        }
      }
    },
    imageUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp'
  };

  const testToolWithCredential = {
    name: 'Stripe',
    description: 'Stripe payment processing integration',
    config: {
      mcp: {
        server: {
          url: 'https://stripe-mcp-hazel.vercel.app/mcp'
        },
        transport: {
          type: 'streamable_http'
        }
      }
    },
    credential: envSettings.getEnvironmentCredential('stripe_api_key')
  };

  describe('generateMcpToolImports', () => {
    it('should generate basic imports', () => {
      const imports = generateMcpToolImports('weather-mcp', testToolData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { mcpTool } from '@inkeep/agents-sdk';");
    });

    it('should not add environment settings import for direct credential references', () => {
      const imports = generateMcpToolImports('stripe-mcp', testToolWithCredential);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { mcpTool } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateMcpToolImports('weather-mcp', testToolData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    ',
      });

      expect(imports[0]).toBe('import { mcpTool } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateMcpToolDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateMcpToolDefinition('weather-mcp', testToolData);

      expect(definition).toContain('export const weatherMcp = mcpTool({');
      expect(definition).toContain("id: 'weather-mcp',");
      expect(definition).toContain("name: 'Weather',");
      expect(definition).toContain("serverUrl: 'https://weather-mcp-hazel.vercel.app/mcp',");
      expect(definition).toContain("description: 'Get weather information from external API',");
      expect(definition).toContain(
        "imageUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp'"
      );
      expect(definition).toContain('});');
    });

    it('should handle tool ID to camelCase conversion', () => {
      const definition = generateMcpToolDefinition('stripe-payment-tool', {
        name: 'Stripe Payment',
        config: {
          mcp: {
            server: {
              url: 'https://stripe.example.com/mcp'
            },
            transport: { type: 'streamable_http' }
          }
        }
      });

      expect(definition).toContain('export const stripePaymentTool = mcpTool({');
      expect(definition).toContain("id: 'stripe-payment-tool',");
    });

    it('should throw error for missing name', () => {
      expect(() => {
        generateMcpToolDefinition('my-mcp-tool', {
          serverUrl: 'https://example.com/mcp',
          description: 'Tool without explicit name',
        });
      }).toThrow("Missing required fields for MCP tool 'my-mcp-tool': name");
    });

    it('should throw error for missing serverUrl', () => {
      expect(() => {
        generateMcpToolDefinition('no-server', { name: 'No Server Tool' });
      }).toThrow("Missing required fields for MCP tool 'no-server': serverUrl");
    });

    it('should handle credential as direct reference', () => {
      const definition = generateMcpToolDefinition('stripe-mcp', testToolWithCredential);

      expect(definition).toContain('credential: mock-credential-stripe_api_key');
    });

    it('should handle credential as object', () => {
      const toolWithObjectCredential = {
        name: 'API Tool',
        config: {
          mcp: {
            server: {
              url: 'https://api.example.com/mcp'
            },
            transport: { type: 'streamable_http' }
          }
        },
        credential: {
          type: 'api_key',
          value: 'my-api-key',
        },
      };

      const definition = generateMcpToolDefinition('api-tool', toolWithObjectCredential);

      expect(definition).toContain('credential: {"type":"api_key","value":"my-api-key"}');
    });

    it('should throw error for missing required fields', () => {
      expect(() => {
        generateMcpToolDefinition('minimal', {});
      }).toThrow("Missing required fields for MCP tool 'minimal': name, serverUrl");
    });

    it('should handle multiline descriptions', () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information about the MCP tool functionality';
      const dataWithLongDesc = {
        name: 'detailed-mcp-tool',
        serverUrl: 'https://detailed.example.com/mcp',
        description: longDescription,
      };

      const definition = generateMcpToolDefinition('detailed', dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);
    });

    it('should handle special characters in URLs', () => {
      const toolData = {
        name: 'Special Tool',
        config: {
          mcp: {
            server: {
          url: 'https://api.example.com/mcp?key=value&param=test'
        },
            transport: {
              type: 'streamable_http'
            }
          }
        },
        imageUrl: 'https://images.example.com/icon.png?size=256&format=webp'
      };

      const definition = generateMcpToolDefinition('special', toolData);

      expect(definition).toContain(
        "serverUrl: 'https://api.example.com/mcp?key=value&param=test',"
      );
      expect(definition).toContain(
        "imageUrl: 'https://images.example.com/icon.png?size=256&format=webp'"
      );
    });
  });

  describe('generateMcpToolFile', () => {
    it('should generate complete file with imports and definition', () => {
      const file = generateMcpToolFile('weather-mcp', testToolData);

      expect(file).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const weatherMcp = mcpTool({');
      expect(file).toContain("name: 'Weather',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });

    it('should generate complete file with direct credential', () => {
      const file = generateMcpToolFile('stripe-mcp', testToolWithCredential);

      expect(file).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(file).not.toContain('import { envSettings }');
      expect(file).toContain('export const stripeMcp = mcpTool({');
      expect(file).toContain('credential: mock-credential-stripe_api_key');
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working MCP tool', async () => {
      const file = generateMcpToolFile('weather-mcp', testToolData);

      // Extract just the tool definition (remove imports and export)
      const definition = generateMcpToolDefinition('weather-mcp', testToolData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const mcpTool = (config) => config;
        
        ${definitionWithoutExport}
        
        return weatherMcp;
      `;

      // Use eval to test the code compiles and runs
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.id).toBe('weather-mcp');
      expect(result.name).toBe('Weather');
      expect(result.serverUrl).toBe('https://weather-mcp-hazel.vercel.app/mcp');
      expect(result.description).toBe('Get weather information from external API');
      expect(result.imageUrl).toBe(
        'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp'
      );
    });

    it('should generate code for MCP tool with credential that compiles', () => {
      const file = generateMcpToolFile('stripe-mcp', testToolWithCredential);

      // Should not include environment import for direct credentials
      expect(file).not.toContain('import { envSettings }');
      expect(file).toContain('import { mcpTool }');

      // Test compilation with mocked envSettings
      const definition = generateMcpToolDefinition('stripe-mcp', testToolWithCredential);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const mcpTool = (config) => config;
        const mockCredentialStripeApiKey = "test-credential-value";
        
        ${definitionWithoutExport.replace('mock-credential-stripe_api_key', 'mockCredentialStripeApiKey')}
        
        return stripeMcp;
      `;

      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.id).toBe('stripe-mcp');
      expect(result.name).toBe('Stripe');
      expect(result.serverUrl).toBe('https://stripe-mcp-hazel.vercel.app/mcp');
      expect(result.credential).toBeDefined();
    });

    it('should throw error for minimal MCP tool without required fields', () => {
      const minimalData = {};

      expect(() => {
        generateMcpToolDefinition('minimal-mcp', minimalData);
      }).toThrow("Missing required fields for MCP tool 'minimal-mcp': name, serverUrl");
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty tool data', () => {
      expect(() => {
        generateMcpToolDefinition('empty', {});
      }).toThrow("Missing required fields for MCP tool 'empty': name, serverUrl");
    });

    it('should handle special characters in tool ID', () => {
      const definition = generateMcpToolDefinition('mcp-tool_v2', {
        name: 'MCP Tool V2',
        serverUrl: 'https://v2.example.com/mcp',
      });

      expect(definition).toContain('export const mcpToolV2 = mcpTool({');
      expect(definition).toContain("id: 'mcp-tool_v2',");
    });

    it('should handle tool ID starting with number', () => {
      const definition = generateMcpToolDefinition('2023-mcp-tool', {
        name: 'MCP Tool 2023',
        serverUrl: 'https://2023.example.com/mcp',
      });

      expect(definition).toContain('export const _2023McpTool = mcpTool({');
    });

    it('should handle invalid URLs gracefully', () => {
      const toolData = {
        name: 'Invalid URL Tool',
        config: {
          mcp: {
            server: {
              url: 'not-a-valid-url'
            },
            transport: { type: 'streamable_http' }
          }
        },
        imageUrl: 'also-not-valid'
      };

      const definition = generateMcpToolDefinition('invalid', toolData);

      expect(definition).toContain("serverUrl: 'not-a-valid-url',");
      expect(definition).toContain("imageUrl: 'also-not-valid'");
    });

    it('should handle null and undefined values gracefully', () => {
      const toolData = {
        name: 'Null Tool',
        serverUrl: 'https://example.com/mcp',
        description: null,
        imageUrl: undefined,
        credential: null,
      };

      const definition = generateMcpToolDefinition('null-tool', toolData);

      expect(definition).toContain('export const nullTool = mcpTool({');
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('imageUrl:');
      expect(definition).not.toContain('credential:');
    });

    it('should throw error for missing name only', () => {
      expect(() => {
        generateMcpToolDefinition('missing-name', { serverUrl: 'https://example.com/mcp' });
      }).toThrow("Missing required fields for MCP tool 'missing-name': name");
    });

    it('should throw error for missing serverUrl only', () => {
      expect(() => {
        generateMcpToolDefinition('missing-server', { name: 'Missing Server Tool' });
      }).toThrow("Missing required fields for MCP tool 'missing-server': serverUrl");
    });
  });
});
