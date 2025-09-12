import { ChartCard, type ChartCardProps } from './chart-card';
import { Stat, type StatProps } from './stat';

type StatCardProps = StatProps &
  Pick<
    ChartCardProps,
    | 'title'
    | 'description'
    | 'footer'
    | 'hasError'
    | 'Icon'
    | 'tooltip'
    | 'titleClassName'
    | 'className'
    | 'onClick'
  >;

export function StatCard({
  title,
  Icon,
  description,
  footer,
  hasError,
  tooltip,
  titleClassName,
  className,
  onClick,
  ...props
}: StatCardProps) {
  return (
    <ChartCard
      className={className}
      description={description}
      footer={footer}
      hasError={hasError}
      Icon={Icon}
      title={title}
      titleClassName={titleClassName}
      tooltip={tooltip}
      onClick={onClick}
    >
      <Stat {...props} />
    </ChartCard>
  );
}
