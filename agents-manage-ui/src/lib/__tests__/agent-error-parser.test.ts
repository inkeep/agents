import { describe, expect, it } from 'vitest';
import { FullAgentAgentInsertSchema } from '@inkeep/agents-core';
import { parseAgentValidationErrors } from '@/lib/utils/agent-error-parser';

describe('FullGraphDefinitionSchema', () => {
  it('should have user friendly error for agents', () => {
    try {
      FullAgentAgentInsertSchema.parse({
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
      const result = parseAgentValidationErrors(apiError);
      expect(result.allErrors[0].field).toBe('description');
      expect(result.allErrors[0].message).toBe('Sub Agent is missing required field: Description');
      expect(result.allErrors[1].field).toBe('prompt');
      expect(result.allErrors[1].message).toBe('Sub Agent is missing required field: Prompt');
      expect(result.allErrors[2].field).toBe('type');
      expect(result.allErrors[2].message).toBe(
        'Sub Agent Type: Invalid input: expected "internal"'
      );
      expect(result.allErrors[3].field).toBe('canUse');
      expect(result.allErrors[3].message).toBe(
        'Sub Agent Can Use has invalid type. Expected array'
      );
      expect(result.totalErrors).toBe(4);
      expect(result).toMatchInlineSnapshot(`
        {
          "agentErrors": [
            {
              "edgeId": undefined,
              "field": "description",
              "fullPath": [
                "description",
                "description",
              ],
              "message": "Sub Agent is missing required field: Description",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "description",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "prompt",
              "fullPath": [
                "prompt",
                "prompt",
              ],
              "message": "Sub Agent is missing required field: Prompt",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "prompt",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "type",
              "fullPath": [
                "type",
                "type",
              ],
              "message": "Sub Agent Type: Invalid input: expected "internal"",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_value",
                "message": "Invalid input: expected "internal"",
                "path": [
                  "type",
                ],
                "values": [
                  "internal",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "canUse",
              "fullPath": [
                "canUse",
                "canUse",
              ],
              "message": "Sub Agent Can Use has invalid type. Expected array",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "array",
                "message": "Invalid input: expected array, received undefined",
                "path": [
                  "canUse",
                ],
              },
              "type": "agent",
            },
          ],
          "allErrors": [
            {
              "edgeId": undefined,
              "field": "description",
              "fullPath": [
                "description",
                "description",
              ],
              "message": "Sub Agent is missing required field: Description",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "description",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "prompt",
              "fullPath": [
                "prompt",
                "prompt",
              ],
              "message": "Sub Agent is missing required field: Prompt",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "string",
                "message": "Invalid input: expected string, received undefined",
                "path": [
                  "prompt",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "type",
              "fullPath": [
                "type",
                "type",
              ],
              "message": "Sub Agent Type: Invalid input: expected "internal"",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_value",
                "message": "Invalid input: expected "internal"",
                "path": [
                  "type",
                ],
                "values": [
                  "internal",
                ],
              },
              "type": "agent",
            },
            {
              "edgeId": undefined,
              "field": "canUse",
              "fullPath": [
                "canUse",
                "canUse",
              ],
              "message": "Sub Agent Can Use has invalid type. Expected array",
              "nodeId": undefined,
              "nodeType": undefined,
              "originalError": {
                "code": "invalid_type",
                "expected": "array",
                "message": "Invalid input: expected array, received undefined",
                "path": [
                  "canUse",
                ],
              },
              "type": "agent",
            },
          ],
          "edgeErrors": {},
          "functionToolErrors": {},
          "nodeErrors": {},
          "subAgentErrors": {},
          "totalErrors": 4,
        }
      `);
    }
  });
});
