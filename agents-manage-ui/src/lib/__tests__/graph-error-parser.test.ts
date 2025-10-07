import { describe, expect, it } from 'vitest';
import { FullGraphDefinitionSchema } from '@inkeep/agents-core';
import { parseGraphValidationErrors } from '@/lib/utils/graph-error-parser';

describe('FullGraphDefinitionSchema', () => {
  it('should have user friendly error for agents', () => {
    try {
      FullGraphDefinitionSchema.parse({
        id: 'XmkebOuDk5YM8MvwEPOCD',
        name: 'Untitled Graph',
        defaultAgentId: 'WBLkgu_3cmQCZ-DXK3vL1',
        agents: {
          'WBLkgu_3cmQCZ-DXK3vL1': {
            id: 'WBLkgu_3cmQCZ-DXK3vL1',
            name: '',
            description: '',
            canUse: [],
            canTransferTo: [],
            canDelegateTo: [],
            dataComponents: [],
            artifactComponents: [],
            type: 'internal',
          },
          '1RJklJX9eQn-MaNIjVyuz': {
            id: '1RJklJX9eQn-MaNIjVyuz',
            name: '',
            description: '',
            headers: null,
            type: 'external',
            credentialReferenceId: null,
          },
        },
      });
    } catch (error) {
      const apiError = error!.toString();
      const result = parseGraphValidationErrors(apiError);
      expect(result.allErrors[0].field).toBe('prompt');
      expect(result.allErrors[0].message).toBe('Agent is missing required field: Prompt');
      expect(result.allErrors[1].field).toBe('baseUrl');
      expect(result.allErrors[1].message).toBe('Agent is missing required field: Host URL');
      expect(result.totalErrors).toBe(2);
      expect(result).toMatchInlineSnapshot(`
        {
          "allErrors": [
            {
              "edgeId": undefined,
              "field": "prompt",
              "fullPath": [
                "agents",
                "WBLkgu_3cmQCZ-DXK3vL1",
                "prompt",
                "agents",
                "WBLkgu_3cmQCZ-DXK3vL1",
                "prompt",
              ],
              "message": "Agent is missing required field: Prompt",
              "nodeId": "WBLkgu_3cmQCZ-DXK3vL1",
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "agents",
                  "WBLkgu_3cmQCZ-DXK3vL1",
                  "prompt",
                ],
              },
              "type": "node",
            },
            {
              "edgeId": undefined,
              "field": "baseUrl",
              "fullPath": [
                "agents",
                "1RJklJX9eQn-MaNIjVyuz",
                "baseUrl",
                "agents",
                "1RJklJX9eQn-MaNIjVyuz",
                "baseUrl",
              ],
              "message": "Agent is missing required field: Host URL",
              "nodeId": "1RJklJX9eQn-MaNIjVyuz",
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "agents",
                  "1RJklJX9eQn-MaNIjVyuz",
                  "baseUrl",
                ],
              },
              "type": "node",
            },
          ],
          "edgeErrors": {},
          "graphErrors": [],
          "nodeErrors": {
            "1RJklJX9eQn-MaNIjVyuz": [
              {
                "edgeId": undefined,
                "field": "baseUrl",
                "fullPath": [
                  "agents",
                  "1RJklJX9eQn-MaNIjVyuz",
                  "baseUrl",
                  "agents",
                  "1RJklJX9eQn-MaNIjVyuz",
                  "baseUrl",
                ],
                "message": "Agent is missing required field: Host URL",
                "nodeId": "1RJklJX9eQn-MaNIjVyuz",
                "originalError": {
                  "code": "invalid_type",
                  "expected": "string",
                  "message": "Invalid input: expected string, received undefined",
                  "path": [
                    "agents",
                    "1RJklJX9eQn-MaNIjVyuz",
                    "baseUrl",
                  ],
                },
                "type": "node",
              },
            ],
            "WBLkgu_3cmQCZ-DXK3vL1": [
              {
                "edgeId": undefined,
                "field": "prompt",
                "fullPath": [
                  "agents",
                  "WBLkgu_3cmQCZ-DXK3vL1",
                  "prompt",
                  "agents",
                  "WBLkgu_3cmQCZ-DXK3vL1",
                  "prompt",
                ],
                "message": "Agent is missing required field: Prompt",
                "nodeId": "WBLkgu_3cmQCZ-DXK3vL1",
                "originalError": {
                  "code": "invalid_type",
                  "expected": "string",
                  "message": "Invalid input: expected string, received undefined",
                  "path": [
                    "agents",
                    "WBLkgu_3cmQCZ-DXK3vL1",
                    "prompt",
                  ],
                },
                "type": "node",
              },
            ],
          },
          "totalErrors": 2,
        }
      `);
    }
  });
});
