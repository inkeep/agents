import { AreaChart, type AreaChartProps } from '@/components/traces/charts/area-chart';
import { ChartCard, type ChartCardProps } from '@/components/traces/charts/chart-card';
import { ChartNoResults } from '@/components/traces/charts/chart-no-results';
import { Skeleton } from '@/components/ui/skeleton';

type AreaChartCardProps<TData> = AreaChartProps<TData> &
  Pick<
    ChartCardProps,
    'title' | 'description' | 'footer' | 'hasError' | 'tooltip' | 'Icon' | 'className'
  >;

export function AreaChartCard<TData>({
  title,
  description,
  footer,
  hasError,
  tooltip,
  Icon,
  className,
  ...props
}: AreaChartCardProps<TData>) {
  return (
    <ChartCard
      className={className}
      description={description}
      footer={footer}
      hasError={hasError}
      Icon={Icon}
      title={title}
      tooltip={tooltip}
    >
      {props.isLoading ? (
        <Skeleton className="h-96" />
      ) : props?.data?.length === 0 ? (
        <ChartNoResults />
      ) : (
        <AreaChart {...props} />
      )}
    </ChartCard>
  );
}
