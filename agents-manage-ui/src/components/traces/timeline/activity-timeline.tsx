import { TimelineItem } from '@/components/traces/timeline/timeline-item';
import type { ActivityItem } from '@/components/traces/timeline/types';

export function ActivityTimeline({
  activities,
  onSelect,
  collapsedAiMessages,
  onToggleAiMessageCollapse,
}: {
  activities: ActivityItem[];
  onSelect: (a: ActivityItem) => void;
  collapsedAiMessages?: Set<string>;
  onToggleAiMessageCollapse?: (activityId: string) => void;
}) {
  return (
    <div className="pt-2 px-6 pb-6">
      <div className="relative grid gap-8">
        {activities.map((activity, index) => (
          <TimelineItem
            key={`${activity.id}-${activity.type}-${index}`}
            activity={activity}
            isLast={index === activities.length - 1}
            onSelect={() => onSelect(activity)}
            isAiMessageCollapsed={collapsedAiMessages?.has(activity.id) || false}
            onToggleAiMessageCollapse={onToggleAiMessageCollapse}
          />
        ))}
      </div>
    </div>
  );
}
