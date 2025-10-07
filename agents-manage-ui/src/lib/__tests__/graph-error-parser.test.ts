import { describe, expect, it } from 'vitest';
import { FullGraphDefinitionSchema } from '@inkeep/agents-core';
import { parseGraphValidationErrors } from '@/lib/utils/graph-error-parser';

describe('FullGraphDefinitionSchema', () => {
  it('should have user friendly error', () => {
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
      expect(parseGraphValidationErrors(error.toString())).toMatchInlineSnapshot(`
        {
          "allErrors": [
            {
              "edgeId": undefined,
              "field": "agents.WBLkgu_3cmQCZ-DXK3vL1.prompt",
              "fullPath": [
                "agents",
                "WBLkgu_3cmQCZ-DXK3vL1",
                "prompt",
                "agents",
                "WBLkgu_3cmQCZ-DXK3vL1",
                "prompt",
              ],
              "message": "Agent is missing required field: Agents. W B Lkgu_3cm Q C Z- D X K3v L1.prompt",
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
              "field": "agents.1RJklJX9eQn-MaNIjVyuz.baseUrl",
              "fullPath": [
                "agents",
                "1RJklJX9eQn-MaNIjVyuz",
                "baseUrl",
                "agents",
                "1RJklJX9eQn-MaNIjVyuz",
                "baseUrl",
              ],
              "message": "Agent is missing required field: Agents.1 R Jkl J X9e Qn- Ma N Ij Vyuz.base Url",
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
                "field": "agents.1RJklJX9eQn-MaNIjVyuz.baseUrl",
                "fullPath": [
                  "agents",
                  "1RJklJX9eQn-MaNIjVyuz",
                  "baseUrl",
                  "agents",
                  "1RJklJX9eQn-MaNIjVyuz",
                  "baseUrl",
                ],
                "message": "Agent is missing required field: Agents.1 R Jkl J X9e Qn- Ma N Ij Vyuz.base Url",
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
                "field": "agents.WBLkgu_3cmQCZ-DXK3vL1.prompt",
                "fullPath": [
                  "agents",
                  "WBLkgu_3cmQCZ-DXK3vL1",
                  "prompt",
                  "agents",
                  "WBLkgu_3cmQCZ-DXK3vL1",
                  "prompt",
                ],
                "message": "Agent is missing required field: Agents. W B Lkgu_3cm Q C Z- D X K3v L1.prompt",
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
