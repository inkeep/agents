import { Area, CartesianGrid, AreaChart as RechartsAreaChart, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

export interface AreaChartProps<TData> {
  data?: TData[];
  config: ChartConfig;
  tickFormatter?: (value: string) => string;
  xAxisDataKey: string;
  dataKeyOne: string;
  dataKeyTwo?: string;
  isLoading?: boolean;
  yAxisDataKey?: string;
  yAxisTickFormatter?: (value: string | number) => string;
  chartContainerClassName?: string;
}

export function AreaChart<TData>({
  data,
  config,
  xAxisDataKey,
  dataKeyOne,
  dataKeyTwo,
  tickFormatter,
  yAxisDataKey,
  yAxisTickFormatter,
  chartContainerClassName,
}: AreaChartProps<TData>) {
  return (
    <ChartContainer className={chartContainerClassName} config={config}>
      <RechartsAreaChart
        accessibilityLayer
        data={data}
        margin={{
          left: 4,
          right: 4,
          top: 4,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey={xAxisDataKey}
          tickFormatter={tickFormatter}
          tickLine={false}
          tickMargin={8}
        />
        {yAxisDataKey && (
          <YAxis
            axisLine={false}
            dataKey={yAxisDataKey}
            tickFormatter={yAxisTickFormatter}
            tickLine={false}
            tickMargin={8}
          />
        )}
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={tickFormatter} />}
          cursor={false}
        />
        <defs>
          <linearGradient id="fillOne" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={config[dataKeyOne].color} stopOpacity={0.8} />
            <stop offset="95%" stopColor={config[dataKeyOne].color} stopOpacity={0.1} />
          </linearGradient>
          {dataKeyTwo && (
            <linearGradient id="fillTwo" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={config[dataKeyTwo].color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={config[dataKeyTwo].color} stopOpacity={0.1} />
            </linearGradient>
          )}
        </defs>
        <Area
          dataKey={dataKeyOne}
          fill="url(#fillOne)" // natural was causing lines to go below and above the chart
          fillOpacity={0.4}
          stackId="a"
          stroke={config[dataKeyOne].color}
          type="monotone"
        />
        {dataKeyTwo && (
          <Area
            dataKey={dataKeyTwo}
            fill="url(#fillTwo)"
            fillOpacity={0.4}
            stackId="a"
            stroke={config[dataKeyTwo].color}
            type="monotone"
          />
        )}
      </RechartsAreaChart>
    </ChartContainer>
  );
}
