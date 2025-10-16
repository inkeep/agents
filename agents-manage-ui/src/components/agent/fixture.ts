export const fixture = [
  {
    detail: {
      type: 'agent_initializing',
      details: {
        sessionId: 'chatds-1760636659082',
        agentId: 'weather-agent',
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636659101,
    },
  },
  {
    detail: {
      type: 'delegation_sent',
      label: 'Task delegated: weather-assistant → geocoder-agent',
      details: {
        timestamp: 1760636663996,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del__-UC4WOd9581NgGHeloUc',
          fromSubAgent: 'weather-assistant',
          targetSubAgent: 'geocoder-agent',
          taskDescription: 'Get the coordinates for Paris.',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636664000,
    },
  },
  {
    detail: {
      type: 'tool_call',
      label: 'Tool call: geocode',
      details: {
        timestamp: 1760636669978,
        subAgentId: 'geocoder-agent',
        data: {
          toolName: 'geocode',
          input: {
            address: 'Paris, France',
          },
          toolCallId: 'call_wP24WSyPjPfBmBYzxZKKnHY8',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636669979,
    },
  },
  {
    detail: {
      type: 'tool_result',
      label: 'Tool result: geocode (completed)',
      details: {
        timestamp: 1760636670614,
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
            toolCallId: 'call_wP24WSyPjPfBmBYzxZKKnHY8',
          },
          toolCallId: 'call_wP24WSyPjPfBmBYzxZKKnHY8',
          duration: 636,
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636670618,
    },
  },
  {
    detail: {
      type: 'agent_generate',
      label: 'Agent geocoder-agent generating response',
      details: {
        timestamp: 1760636673976,
        subAgentId: 'geocoder-agent',
        data: {
          parts: [
            {
              type: 'text',
              content:
                'The coordinates for Paris, France are approximately:\n\n- **Latitude**: 48.85341\n- **Longitude**: 2.3488',
            },
          ],
          generationType: 'text_generation',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636673980,
    },
  },
  {
    detail: {
      type: 'delegation_returned',
      label: 'Task completed: weather-assistant → geocoder-agent',
      details: {
        timestamp: 1760636673981,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del__-UC4WOd9581NgGHeloUc',
          fromSubAgent: 'geocoder-agent',
          targetSubAgent: 'weather-assistant',
          result: {
            messageId: '_cPdI9yxGBizeOs5UQIbq',
            parts: [
              {
                kind: 'text',
                text: 'The coordinates for Paris, France are approximately:\n\n- **Latitude**: 48.85341\n- **Longitude**: 2.3488',
              },
            ],
            role: 'agent',
            taskId: '0IKMVwb9BUy1tMP_-DLoJ',
            contextId: 'pMpswoNOwneaD0mmBxJkN',
            kind: 'message',
          },
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636674103,
    },
  },
  {
    detail: {
      type: 'delegation_sent',
      label: 'Task delegated: weather-assistant → weather-forecaster',
      details: {
        timestamp: 1760636676217,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_8iBhEnqj6C3yqkLqT3j9t',
          fromSubAgent: 'weather-assistant',
          targetSubAgent: 'weather-forecaster',
          taskDescription: 'Get the weather forecast for the coordinates 48.85341, 2.3488.',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636676220,
    },
  },
  {
    detail: {
      type: 'tool_call',
      label: 'Tool call: get_weather_forecast',
      details: {
        timestamp: 1760636679626,
        subAgentId: 'weather-forecaster',
        data: {
          toolName: 'get_weather_forecast',
          input: {
            latitude: 48.85341,
            longitude: 2.3488,
          },
          toolCallId: 'call_miOgZVbwG64WABtMLqbr0s7z',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636679628,
    },
  },
  {
    detail: {
      type: 'tool_result',
      label: 'Tool result: get_weather_forecast (completed)',
      details: {
        timestamp: 1760636680375,
        subAgentId: 'weather-forecaster',
        data: {
          toolName: 'get_weather_forecast',
          output: {
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Weather Forecast for coordinates (48.85341, 2.3488):\n\nNext 24 Hours Temperature Forecast:\n- 2025-10-16T17:00: 58.5°F (weatherCode: 3)\n- 2025-10-16T18:00: 58.1°F (weatherCode: 3)\n- 2025-10-16T19:00: 57.1°F (weatherCode: 2)\n- 2025-10-16T20:00: 56.8°F (weatherCode: 2)\n- 2025-10-16T21:00: 55.3°F (weatherCode: 0)\n- 2025-10-16T22:00: 54.2°F (weatherCode: 0)\n- 2025-10-16T23:00: 53.1°F (weatherCode: 0)\n- 2025-10-17T00:00: 52.2°F (weatherCode: 0)\n- 2025-10-17T01:00: 51.5°F (weatherCode: 0)\n- 2025-10-17T02:00: 50.9°F (weatherCode: 0)\n- 2025-10-17T03:00: 50.1°F (weatherCode: 0)\n- 2025-10-17T04:00: 49.5°F (weatherCode: 0)\n- 2025-10-17T05:00: 49°F (weatherCode: 1)\n- 2025-10-17T06:00: 48.4°F (weatherCode: 1)\n- 2025-10-17T07:00: 48.4°F (weatherCode: 1)\n- 2025-10-17T08:00: 49.8°F (weatherCode: 1)\n- 2025-10-17T09:00: 52°F (weatherCode: 2)\n- 2025-10-17T10:00: 54.8°F (weatherCode: 2)\n- 2025-10-17T11:00: 57.3°F (weatherCode: 2)\n- 2025-10-17T12:00: 59.6°F (weatherCode: 2)\n- 2025-10-17T13:00: 61.2°F (weatherCode: 2)\n- 2025-10-17T14:00: 61.6°F (weatherCode: 1)\n- 2025-10-17T15:00: 61.6°F (weatherCode: 2)\n- 2025-10-17T16:00: 60.9°F (weatherCode: 2)',
                },
              ],
            },
            toolCallId: 'call_miOgZVbwG64WABtMLqbr0s7z',
          },
          toolCallId: 'call_miOgZVbwG64WABtMLqbr0s7z',
          duration: 750,
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636680379,
    },
  },
  {
    detail: {
      type: 'agent_generate',
      label: 'Agent weather-forecaster generating response',
      details: {
        timestamp: 1760636692637,
        subAgentId: 'weather-forecaster',
        data: {
          parts: [
            {
              type: 'text',
              content:
                'Here is the weather forecast for Paris (coordinates: 48.85341, 2.3488) over the next 24 hours:\n\n- **17:00**: 58.5°F (Weather Code: 3)\n- **18:00**: 58.1°F (Weather Code: 3)\n- **19:00**: 57.1°F (Weather Code: 2)\n- **20:00**: 56.8°F (Weather Code: 2)\n- **21:00**: 55.3°F (Weather Code: 0)\n- **22:00**: 54.2°F (Weather Code: 0)\n- **23:00**: 53.1°F (Weather Code: 0)\n- **00:00**: 52.2°F (Weather Code: 0)\n- **01:00**: 51.5°F (Weather Code: 0)\n- **02:00**: 50.9°F (Weather Code: 0)\n- **03:00**: 50.1°F (Weather Code: 0)\n- **04:00**: 49.5°F (Weather Code: 0)\n- **05:00**: 49°F (Weather Code: 1)\n- **06:00**: 48.4°F (Weather Code: 1)\n- **07:00**: 48.4°F (Weather Code: 1)\n- **08:00**: 49.8°F (Weather Code: 1)\n- **09:00**: 52°F (Weather Code: 2)\n- **10:00**: 54.8°F (Weather Code: 2)\n- **11:00**: 57.3°F (Weather Code: 2)\n- **12:00**: 59.6°F (Weather Code: 2)\n- **13:00**: 61.2°F (Weather Code: 2)\n- **14:00**: 61.6°F (Weather Code: 1)\n- **15:00**: 61.6°F (Weather Code: 2)\n- **16:00**: 60.9°F (Weather Code: 2)\n\nIf you need more specific details or future forecasts, let me know!',
            },
          ],
          generationType: 'text_generation',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636692641,
    },
  },
  {
    detail: {
      type: 'delegation_returned',
      label: 'Task completed: weather-assistant → weather-forecaster',
      details: {
        timestamp: 1760636692643,
        subAgentId: 'weather-assistant',
        data: {
          delegationId: 'del_8iBhEnqj6C3yqkLqT3j9t',
          fromSubAgent: 'weather-forecaster',
          targetSubAgent: 'weather-assistant',
          result: {
            messageId: '7aOn-w5-Z3ccq3KfXEVW7',
            parts: [
              {
                kind: 'text',
                text: 'Here is the weather forecast for Paris (coordinates: 48.85341, 2.3488) over the next 24 hours:\n\n- **17:00**: 58.5°F (Weather Code: 3)\n- **18:00**: 58.1°F (Weather Code: 3)\n- **19:00**: 57.1°F (Weather Code: 2)\n- **20:00**: 56.8°F (Weather Code: 2)\n- **21:00**: 55.3°F (Weather Code: 0)\n- **22:00**: 54.2°F (Weather Code: 0)\n- **23:00**: 53.1°F (Weather Code: 0)\n- **00:00**: 52.2°F (Weather Code: 0)\n- **01:00**: 51.5°F (Weather Code: 0)\n- **02:00**: 50.9°F (Weather Code: 0)\n- **03:00**: 50.1°F (Weather Code: 0)\n- **04:00**: 49.5°F (Weather Code: 0)\n- **05:00**: 49°F (Weather Code: 1)\n- **06:00**: 48.4°F (Weather Code: 1)\n- **07:00**: 48.4°F (Weather Code: 1)\n- **08:00**: 49.8°F (Weather Code: 1)\n- **09:00**: 52°F (Weather Code: 2)\n- **10:00**: 54.8°F (Weather Code: 2)\n- **11:00**: 57.3°F (Weather Code: 2)\n- **12:00**: 59.6°F (Weather Code: 2)\n- **13:00**: 61.2°F (Weather Code: 2)\n- **14:00**: 61.6°F (Weather Code: 1)\n- **15:00**: 61.6°F (Weather Code: 2)\n- **16:00**: 60.9°F (Weather Code: 2)\n\nIf you need more specific details or future forecasts, let me know!',
              },
            ],
            role: 'agent',
            taskId: 'f82kCMufnCuHN8cEHY_ui',
            contextId: 'pMpswoNOwneaD0mmBxJkN',
            kind: 'message',
          },
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636692772,
    },
  },
  {
    detail: {
      type: 'agent_generate',
      label: 'Agent weather-assistant generating response',
      details: {
        timestamp: 1760636726126,
        subAgentId: 'weather-assistant',
        data: {
          parts: [
            {
              type: 'tool_result',
              content:
                '{"id":"weatherForecast","name":"WeatherForecast","props":{"forecast":[{"time":"17:00","temperature":58.5,"code":3},{"time":"18:00","temperature":58.1,"code":3},{"time":"19:00","temperature":57.1,"code":2},{"time":"20:00","temperature":56.8,"code":2},{"time":"21:00","temperature":55.3,"code":0},{"time":"22:00","temperature":54.2,"code":0},{"time":"23:00","temperature":53.1,"code":0},{"time":"00:00","temperature":52.2,"code":0},{"time":"01:00","temperature":51.5,"code":0},{"time":"02:00","temperature":50.9,"code":0},{"time":"03:00","temperature":50.1,"code":0},{"time":"04:00","temperature":49.5,"code":0},{"time":"05:00","temperature":49,"code":1},{"time":"06:00","temperature":48.4,"code":1},{"time":"07:00","temperature":48.4,"code":1},{"time":"08:00","temperature":49.8,"code":1},{"time":"09:00","temperature":52,"code":2},{"time":"10:00","temperature":54.8,"code":2},{"time":"11:00","temperature":57.3,"code":2},{"time":"12:00","temperature":59.6,"code":2},{"time":"13:00","temperature":61.2,"code":2},{"time":"14:00","temperature":61.6,"code":1},{"time":"15:00","temperature":61.6,"code":2},{"time":"16:00","temperature":60.9,"code":2}]}}',
            },
            {
              type: 'text',
              content: 'Here',
            },
            {
              type: 'text',
              content: ' is',
            },
            {
              type: 'text',
              content: ' the',
            },
            {
              type: 'text',
              content: ' weather',
            },
            {
              type: 'text',
              content: ' forecast',
            },
            {
              type: 'text',
              content: ' for',
            },
            {
              type: 'text',
              content: ' Paris',
            },
            {
              type: 'text',
              content: ' (',
            },
            {
              type: 'text',
              content: 'coordinates',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '48',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '853',
            },
            {
              type: 'text',
              content: '41',
            },
            {
              type: 'text',
              content: ',',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '2',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '348',
            },
            {
              type: 'text',
              content: '8',
            },
            {
              type: 'text',
              content: ')',
            },
            {
              type: 'text',
              content: ' over',
            },
            {
              type: 'text',
              content: ' the',
            },
            {
              type: 'text',
              content: ' next',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '24',
            },
            {
              type: 'text',
              content: ' hours',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '17',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '58',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '5',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '18',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '58',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '1',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '19',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '57',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '1',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '20',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '56',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '8',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '21',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '55',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '3',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '22',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '54',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '2',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '23',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '53',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '1',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '52',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '2',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '01',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '51',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '5',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '02',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '50',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '9',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '03',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '50',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '1',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '04',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '49',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '5',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '05',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '49',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '06',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '48',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '4',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '07',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '48',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '4',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '08',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '49',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '8',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '09',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '52',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '10',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '54',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '8',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '11',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '57',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '3',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '12',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '59',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '6',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '13',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '61',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '2',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '14',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '61',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '6',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '15',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '61',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '6',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '-',
            },
            {
              type: 'text',
              content: ' **',
            },
            {
              type: 'text',
              content: '16',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: '00',
            },
            {
              type: 'text',
              content: '**',
            },
            {
              type: 'text',
              content: ':',
            },
            {
              type: 'text',
              content: ' ',
            },
            {
              type: 'text',
              content: '60',
            },
            {
              type: 'text',
              content: '.',
            },
            {
              type: 'text',
              content: '9',
            },
            {
              type: 'text',
              content: '°F',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: '\n',
            },
            {
              type: 'text',
              content: 'If',
            },
            {
              type: 'text',
              content: ' you',
            },
            {
              type: 'text',
              content: ' need',
            },
            {
              type: 'text',
              content: ' more',
            },
            {
              type: 'text',
              content: ' specific',
            },
            {
              type: 'text',
              content: ' details',
            },
            {
              type: 'text',
              content: ' or',
            },
            {
              type: 'text',
              content: ' future',
            },
            {
              type: 'text',
              content: ' forecasts',
            },
            {
              type: 'text',
              content: ',',
            },
            {
              type: 'text',
              content: ' let',
            },
            {
              type: 'text',
              content: ' me',
            },
            {
              type: 'text',
              content: ' know',
            },
            {
              type: 'text',
              content: '!',
            },
          ],
          generationType: 'object_generation',
        },
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636726282,
    },
  },
  {
    detail: {
      type: 'completion',
      details: {
        agent: 'weather-assistant',
        iteration: 1,
      },
      conversationId: 'pMpswoNOwneaD0mmBxJkN',
      timestamp: 1760636726312,
    },
  },
];
