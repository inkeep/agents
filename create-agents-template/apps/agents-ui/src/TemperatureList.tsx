import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TemperatureDataProps} from "../../../src/weather-project/schemas/temperature-schema";

type TemperatureData = TemperatureDataProps['temperature_data'][number];

export const TemperatureList = ({
  temperature_data,
}: TemperatureDataProps) => {
  const getWeatherIcon = (weatherCode: number) => {
    switch (weatherCode) {
      case 0:
        return "☀️"; // Sunny
      case 1:
        return "☀️"; // Mainly sunny
      case 2:
        return "⛅"; // Partly cloudy
      case 3:
        return "☁️"; // Cloudy
      case 4:
        return "🌧️"; // Rainy
      case 5:
        return "⛈️"; // Stormy
      default:
        return "🌤️"; // Default
    }
  };

  const getWeatherDescription = (weatherCode: number) => {
    switch (weatherCode) {
      case 0:
        return "Sunny";
      case 1:
        return "Mainly sunny";
      case 2:
        return "Partly Cloudy";
      case 3:
        return "Cloudy";
      case 4:
        return "Rainy";
      case 5:
        return "Stormy";
      default:
        return "Unknown";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    });
  };

  // Prepare data for the chart
  const chartData = temperature_data.map((datapoint) => ({
    date: formatDate(datapoint.date),
    temperature: Math.round(datapoint.temperature),
    weather_code: datapoint.weather_code,
    fullDate: datapoint.date,
  }));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ payload: TemperatureData & { fullDate: string } }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-gray-200/50 rounded-xl shadow-xl">
          <p className="font-semibold text-gray-800 text-sm mb-2">{label}</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <p className="text-blue-600 font-bold text-lg">
              {data.temperature}°F
            </p>
          </div>
          <p className="text-gray-600 text-sm flex items-center gap-2">
            <span className="text-lg">{getWeatherIcon(data.weather_code)}</span>
            <span className="font-medium">
              {getWeatherDescription(data.weather_code)}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl shadow-lg border border-gray-200/50 p-6 max-w-5xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">🌡️</span>
          Temperature Forecast
        </h3>
        <div className="text-sm text-gray-500">
          {chartData.length} data points
        </div>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              opacity={0.6}
            />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b" }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b" }}
              label={{
                value: "Temperature (°F)",
                angle: -90,
                position: "insideLeft",
                style: {
                  textAnchor: "middle",
                  fill: "#64748b",
                  fontSize: "12px",
                },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="url(#temperatureGradient)"
              strokeWidth={3}
              dot={{
                fill: "#3b82f6",
                strokeWidth: 2,
                r: 5,
                stroke: "#ffffff",
                filter: "drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3))",
              }}
              activeDot={{
                r: 8,
                stroke: "#3b82f6",
                strokeWidth: 3,
                fill: "#ffffff",
                filter: "drop-shadow(0 4px 8px rgba(59, 130, 246, 0.4))",
              }}
            />
            <defs>
              <linearGradient
                id="temperatureGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      {chartData.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-600">
              {Math.round(Math.max(...chartData.map((d) => d.temperature)))}
            </div>
            <div className="text-xs text-blue-600 font-medium">High</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-gray-600">
              {Math.round(
                chartData.reduce((sum, d) => sum + d.temperature, 0) /
                  chartData.length
              )}
            </div>
            <div className="text-xs text-gray-600 font-medium">Average</div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-indigo-600">
              {Math.round(Math.min(...chartData.map((d) => d.temperature)))}
            </div>
            <div className="text-xs text-indigo-600 font-medium">Low</div>
          </div>
        </div>
      )}
    </div>
  );
};
