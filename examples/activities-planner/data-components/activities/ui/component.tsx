import { Calendar, Clock, MapPin, Tag } from 'lucide-react';
import type { ActivitiesProps } from '../schema';

export function Activities(props: ActivitiesProps) {
  const getCategoryColor = (category: ActivitiesProps['activities'][0]['category']) => {
    const colors = {
      Festival: 'bg-accent text-accent-foreground',
      Fitness: 'bg-primary text-primary-foreground',
      'Outdoor Activity': 'bg-secondary text-secondary-foreground',
      Market: 'bg-muted text-muted-foreground',
      Tour: 'bg-accent text-accent-foreground',
      Other: 'bg-muted text-muted-foreground',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      {props.activities.map((activity, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground mb-1.5">{activity.title}</h3>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(activity.category)}`}
              >
                <Tag className="size-3" />
                {activity.category}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-3">{activity.description}</p>

          {activity.details && (
            <div className="space-y-2 mb-3">
              {activity.details.dates && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span>{activity.details.dates}</span>
                </div>
              )}
              {activity.details.time && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Clock className="size-4 text-muted-foreground" />
                  <span>{activity.details.time}</span>
                </div>
              )}
              {activity.details.location && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span>{activity.details.location}</span>
                </div>
              )}
            </div>
          )}

          {activity.subItems && activity.subItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <ul className="space-y-1.5">
                {activity.subItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
