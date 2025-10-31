import "./App.css";

import {
  InkeepEmbeddedChat,
  type InkeepEmbeddedChatProps,
} from "@inkeep/agents-ui";
import { TemperatureList } from "./TemperatureList";

const embeddedChatProps: InkeepEmbeddedChatProps = {
  aiChatSettings: {
    graphUrl: "http://localhost:3003/api/chat",
    headers: {
      tz: "US/Pacific", //Add timezone if different from US/Pacific.
      // You can find a timezone list here: https://github.com/davidayalas/current-time?tab=readme-ov-file
    },
    apiKey: "", // Add API key
    components: {
      "Temperature data": TemperatureList,
    },
  },
};

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <img
                className="w-8 h-8"
                src="https://inkeep.com/icon.png?6ca37ff368dfcee1"
                alt="Inkeep Logo"
              />

              <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                Inkeep Agents UI Quickstart
              </span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              AI Weather Assistant
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
              Ask me anything about weather data, temperature forecasts, or try
              requesting a temperature chart for any city.
            </p>

            {/* Quick Start Examples */}
            <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-white/20 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Try these examples:
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  "What's the weather in San Francisco?"
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  "Show me temperature data for New York"
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  "Will it rain tomorrow in Seattle?"
                </span>
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="bg-white w-[min(640px,100%)] h-[500px] mx-auto rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <InkeepEmbeddedChat {...embeddedChatProps} />
          </div>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              <a
                href="http://localhost:3002"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-700 ml-1"
              >
                Management API
              </a>{" "}
              •
              <a
                href="http://localhost:3003"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-700 ml-1"
              >
                Run API
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
