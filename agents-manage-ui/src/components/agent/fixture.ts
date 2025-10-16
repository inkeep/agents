export const fixture = [
  {
    detail: {
      type: 'agent_initializing',
      details: {
        sessionId: 'chatds-1760624457679',
        agentId: 'weather-agent',
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624457695,
    },
  },
  {
    detail: {
      type: 'delegation_sent',
      label: 'Task delegated: weather-assistant → geocoder-agent',
      details: {
        timestamp: 1760624461948,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_3Loc2XBArZhzt6RdN1HtC',
          fromSubAgent: 'weather-assistant',
          targetSubAgent: 'geocoder-agent',
          taskDescription: 'What are the coordinates for Paris, France?',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624461951,
    },
  },
  {
    detail: {
      type: 'tool_call',
      label: 'Tool call: geocode',
      details: {
        timestamp: 1760624466272,
        subAgentId: 'geocoder-agent',
        data: {
          toolName: 'geocode',
          input: {
            address: 'Paris, France',
          },
          toolCallId: 'call_RQq4gBtPDPFDoIFriQgwX3n4',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624466274,
    },
  },
  {
    detail: {
      type: 'tool_result',
      label: 'Tool result: geocode (completed)',
      details: {
        timestamp: 1760624466916,
        subAgentId: 'geocoder-agent',
        data: {
          toolName: 'geocode',
          output: {
            result: {
              content: [
                {
                  type: 'text',
                  text: {
                    latitude: 48.85341,
                    longitude: 2.3488,
                  },
                },
              ],
            },
            toolCallId: 'call_RQq4gBtPDPFDoIFriQgwX3n4',
          },
          toolCallId: 'call_RQq4gBtPDPFDoIFriQgwX3n4',
          duration: 644,
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624466938,
    },
  },
  {
    detail: {
      type: 'agent_generate',
      label: 'Agent geocoder-agent generating response',
      details: {
        timestamp: 1760624469760,
        subAgentId: 'geocoder-agent',
        data: {
          parts: [
            {
              type: 'text',
              content:
                'The coordinates for Paris, France are:\n\n- **Latitude:** 48.85341\n- **Longitude:** 2.3488',
            },
          ],
          generationType: 'text_generation',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624469762,
    },
  },
  {
    detail: {
      type: 'delegation_returned',
      label: 'Task completed: weather-assistant → geocoder-agent',
      details: {
        timestamp: 1760624469764,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_3Loc2XBArZhzt6RdN1HtC',
          fromSubAgent: 'geocoder-agent',
          targetSubAgent: 'weather-assistant',
          result: {
            messageId: 'h1o5lJDiZIpBYmIu_FCmY',
            parts: [
              {
                kind: 'text',
                text: 'The coordinates for Paris, France are:\n\n- **Latitude:** 48.85341\n- **Longitude:** 2.3488',
              },
            ],
            role: 'agent',
            taskId: 'AVm9hYSO9-mOoate8WBJd',
            contextId: '0zLjw2J0q7TzeLTWnjJvo',
            kind: 'message',
          },
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624469785,
    },
  },
  {
    detail: {
      type: 'delegation_sent',
      label: 'Task delegated: weather-assistant → weather-forecaster',
      details: {
        timestamp: 1760624477948,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_AGtBPPOv1ksibrlkbFJyS',
          fromSubAgent: 'weather-assistant',
          targetSubAgent: 'weather-forecaster',
          taskDescription:
            'What is the current weather forecast for the coordinates Latitude 48.85341 and Longitude 2.3488 in Paris?',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624477955,
    },
  },
  {
    detail: {
      type: 'tool_call',
      label: 'Tool call: get_weather_forecast',
      details: {
        timestamp: 1760624483236,
        subAgentId: 'weather-forecaster',
        data: {
          toolName: 'get_weather_forecast',
          input: {
            latitude: 48.85341,
            longitude: 2.3488,
          },
          toolCallId: 'call_uw3tvTO8c9k2Lyvv6VCUpXAl',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624483239,
    },
  },
  {
    detail: {
      type: 'tool_result',
      label: 'Tool result: get_weather_forecast (completed)',
      details: {
        timestamp: 1760624483869,
        subAgentId: 'weather-forecaster',
        data: {
          toolName: 'get_weather_forecast',
          output: {
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Weather Forecast for coordinates (48.85341, 2.3488):\n\nNext 24 Hours Temperature Forecast:\n- 2025-10-16T14:00: 60.3°F (weatherCode: 3)\n- 2025-10-16T15:00: 60.3°F (weatherCode: 3)\n- 2025-10-16T16:00: 59.5°F (weatherCode: 2)\n- 2025-10-16T17:00: 58.9°F (weatherCode: 3)\n- 2025-10-16T18:00: 58.1°F (weatherCode: 3)\n- 2025-10-16T19:00: 57.8°F (weatherCode: 3)\n- 2025-10-16T20:00: 57.1°F (weatherCode: 2)\n- 2025-10-16T21:00: 55.4°F (weatherCode: 1)\n- 2025-10-16T22:00: 54.2°F (weatherCode: 0)\n- 2025-10-16T23:00: 53.1°F (weatherCode: 0)\n- 2025-10-17T00:00: 52.1°F (weatherCode: 0)\n- 2025-10-17T01:00: 51.5°F (weatherCode: 1)\n- 2025-10-17T02:00: 50.8°F (weatherCode: 0)\n- 2025-10-17T03:00: 50.2°F (weatherCode: 0)\n- 2025-10-17T04:00: 49.5°F (weatherCode: 0)\n- 2025-10-17T05:00: 48.8°F (weatherCode: 1)\n- 2025-10-17T06:00: 48.4°F (weatherCode: 1)\n- 2025-10-17T07:00: 48.2°F (weatherCode: 1)\n- 2025-10-17T08:00: 49.7°F (weatherCode: 0)\n- 2025-10-17T09:00: 52.1°F (weatherCode: 1)\n- 2025-10-17T10:00: 55°F (weatherCode: 1)\n- 2025-10-17T11:00: 57.6°F (weatherCode: 2)\n- 2025-10-17T12:00: 59.9°F (weatherCode: 1)\n- 2025-10-17T13:00: 61.5°F (weatherCode: 1)',
                },
              ],
            },
            toolCallId: 'call_uw3tvTO8c9k2Lyvv6VCUpXAl',
          },
          toolCallId: 'call_uw3tvTO8c9k2Lyvv6VCUpXAl',
          duration: 633,
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624483873,
    },
  },
  {
    detail: {
      type: 'agent_generate',
      label: 'Agent weather-forecaster generating response',
      details: {
        timestamp: 1760624495610,
        subAgentId: 'weather-forecaster',
        data: {
          parts: [
            {
              type: 'text',
              content:
                "Here's the weather forecast for Paris at coordinates Latitude 48.85341 and Longitude 2.3488 for the next 24 hours:\n\n- **14:00:** 60.3°F\n- **15:00:** 60.3°F\n- **16:00:** 59.5°F\n- **17:00:** 58.9°F\n- **18:00:** 58.1°F\n- **19:00:** 57.8°F\n- **20:00:** 57.1°F\n- **21:00:** 55.4°F\n- **22:00:** 54.2°F\n- **23:00:** 53.1°F\n- **00:00 (next day):** 52.1°F\n- **01:00:** 51.5°F\n- **02:00:** 50.8°F\n- **03:00:** 50.2°F\n- **04:00:** 49.5°F\n- **05:00:** 48.8°F\n- **06:00:** 48.4°F\n- **07:00:** 48.2°F\n- **08:00:** 49.7°F\n- **09:00:** 52.1°F\n- **10:00:** 55.0°F\n- **11:00:** 57.6°F\n- **12:00:** 59.9°F\n- **13:00:** 61.5°F\n\nIf you need more details or future forecasts, feel free to ask!",
            },
          ],
          generationType: 'text_generation',
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624495616,
    },
  },
  {
    detail: {
      type: 'delegation_returned',
      label: 'Task completed: weather-assistant → weather-forecaster',
      details: {
        timestamp: 1760624495614,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_AGtBPPOv1ksibrlkbFJyS',
          fromSubAgent: 'weather-forecaster',
          targetSubAgent: 'weather-assistant',
          result: {
            messageId: 'e-bMOdQxqPhMyG-X-Z25W',
            parts: [
              {
                kind: 'text',
                text: "Here's the weather forecast for Paris at coordinates Latitude 48.85341 and Longitude 2.3488 for the next 24 hours:\n\n- **14:00:** 60.3°F\n- **15:00:** 60.3°F\n- **16:00:** 59.5°F\n- **17:00:** 58.9°F\n- **18:00:** 58.1°F\n- **19:00:** 57.8°F\n- **20:00:** 57.1°F\n- **21:00:** 55.4°F\n- **22:00:** 54.2°F\n- **23:00:** 53.1°F\n- **00:00 (next day):** 52.1°F\n- **01:00:** 51.5°F\n- **02:00:** 50.8°F\n- **03:00:** 50.2°F\n- **04:00:** 49.5°F\n- **05:00:** 48.8°F\n- **06:00:** 48.4°F\n- **07:00:** 48.2°F\n- **08:00:** 49.7°F\n- **09:00:** 52.1°F\n- **10:00:** 55.0°F\n- **11:00:** 57.6°F\n- **12:00:** 59.9°F\n- **13:00:** 61.5°F\n\nIf you need more details or future forecasts, feel free to ask!",
              },
            ],
            role: 'agent',
            taskId: '-c7tvQQzRW0dJ2YyUGeDU',
            contextId: '0zLjw2J0q7TzeLTWnjJvo',
            kind: 'message',
          },
        },
      },
      conversationId: '0zLjw2J0q7TzeLTWnjJvo',
      timestamp: 1760624495641,
    },
  },
];
