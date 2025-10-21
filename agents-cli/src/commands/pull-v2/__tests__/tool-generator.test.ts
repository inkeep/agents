import { describe, expect, it } from 'vitest';
import { generateToolFile, DEFAULT_CODE_STYLE } from '../tool-generator';

describe('tool-generator', () => {
  describe('generateToolFile', () => {
    it('should generate an MCP tool file', () => {
      const toolData = {
        id: 'weather-forecast',
        name: 'Forecast weather',
        type: 'mcp',
        mcpConfig: {
          serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp'
        }
      };

      const result = generateToolFile('weather-forecast', toolData);

      expect(result).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(result).toContain("export const weatherForecast = mcpTool({");
      expect(result).toContain("id: 'weather-forecast',");
      expect(result).toContain("name: 'Forecast weather',");
      expect(result).toContain("serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp'");
    });

    it('should handle weird tool IDs like the examples', () => {
      const toolData = {
        id: 'fUI2riwrBVJ6MepT8rjx0',
        name: 'Forecast weather',
        type: 'mcp',
        mcpConfig: {
          serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp'
        }
      };

      const result = generateToolFile('fUI2riwrBVJ6MepT8rjx0', toolData);

      expect(result).toContain("export const fUI2riwrBVJ6MepT8rjx0 = mcpTool({");
      expect(result).toContain("id: 'fUI2riwrBVJ6MepT8rjx0',");
    });

    it('should generate a function tool file', () => {
      const toolData = {
        id: 'calculate-sum',
        name: 'Calculate Sum',
        type: 'function',
        description: 'Calculates the sum of two numbers',
        schema: {
          parameters: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' }
            }
          }
        }
      };

      const result = generateToolFile('calculate-sum', toolData);

      expect(result).toContain("import { functionTool } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("export const calculateSum = functionTool({");
      expect(result).toContain("description: 'Calculates the sum of two numbers',");
      expect(result).toContain("inputSchema: z.object({");
      expect(result).toContain("a: z.number().describe(`First number`),");
      expect(result).toContain("b: z.number().describe(`Second number`),");
    });

    it('should handle tools without schema', () => {
      const toolData = {
        id: 'simple-tool',
        name: 'Simple Tool',
        type: 'function'
      };

      const result = generateToolFile('simple-tool', toolData);

      expect(result).toContain("import { functionTool } from '@inkeep/agents-sdk';");
      expect(result).not.toContain("import { z } from 'zod';");
      expect(result).toContain("export const simpleTool = functionTool({");
      expect(result).not.toContain("inputSchema:");
    });

    it('should use double quotes when configured', () => {
      const toolData = {
        id: 'test-tool',
        name: 'Test Tool',
        type: 'mcp',
        config: {
          mcp: {
            server: {
              url: 'https://example.com/mcp'
            }
          }
        }
      };

      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateToolFile('test-tool', toolData, style);

      expect(result).toContain('import { mcpTool } from "@inkeep/agents-sdk";');
      expect(result).toContain('name: "Test Tool",');
      expect(result).toContain('serverUrl: "https://example.com/mcp"');
    });

    it('should extract full configuration like in docs-assistant example', () => {
      const toolData = {
        id: 'inkeep-rag-mcp',
        name: 'Inkeep RAG MCP',
        config: {
          type: 'mcp',
          mcp: {
            server: {
              url: 'https://agents.inkeep.com/mcp'
            },
            transport: {
              type: 'streamable_http'
            }
          }
        },
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png'
      };

      const result = generateToolFile('inkeep-rag-mcp', toolData);

      expect(result).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(result).toContain("export const inkeepRagMcp = mcpTool({");
      expect(result).toContain("id: 'inkeep-rag-mcp',");
      expect(result).toContain("name: 'Inkeep RAG MCP',");
      expect(result).toContain("serverUrl: 'https://agents.inkeep.com/mcp',");
      expect(result).toContain("transport: {");
      expect(result).toContain("type: 'streamable_http'");
      expect(result).toContain("imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png'");
    });

    it('should handle multiline descriptions', () => {
      const toolData = {
        id: 'complex-tool',
        name: 'Complex Tool',
        type: 'function',
        description: 'This is a very long description\nthat spans multiple lines\nand should use template literals'
      };

      const result = generateToolFile('complex-tool', toolData);

      expect(result).toContain('description: `This is a very long description');
      expect(result).toContain('that spans multiple lines');
      expect(result).toContain('and should use template literals`,');
    });

    it('should fallback to mcpTool for unknown types', () => {
      const toolData = {
        id: 'unknown-tool',
        name: 'Unknown Tool',
        type: 'unknown-type'
      };

      const result = generateToolFile('unknown-tool', toolData);

      expect(result).toContain("import { mcpTool } from '@inkeep/agents-sdk';");
      expect(result).toContain("export const unknownTool = mcpTool({");
    });
  });
});