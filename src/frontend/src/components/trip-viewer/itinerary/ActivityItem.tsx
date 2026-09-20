import { Activity } from "@/types/trip";
import { useFormatters } from "@/hooks/useFormatters";
import { useLanguage } from "@/context/LanguageContext";
import { Star, Plane, Bed, MapPin } from "lucide-react";

interface ActivityItemProps {
  activity: Activity;
  currency: string;
}


/**
 * Individual Itinerary Activity Item.
 * 
 * Renders a single event within a day (e.g., a museum visit, a flight, a hotel check-in).
 * Dynamically adjusts its icon and background color based on the `activity.category`.
 * 
 * @param activity - The Activity data object containing time, title, cost, etc.
 * @param currency - The currency code to format costs.
 */
export function ActivityItem({ activity, currency }: ActivityItemProps) {
  const { t } = useLanguage();
  const { formatCurrency } = useFormatters();
  let bgColor = "bg-glass-bg";
  let Icon = MapPin;

  if (activity.category === "transport") {
    bgColor = "bg-gold/10";
    Icon = Plane;
  } else if (activity.category === "accommodation") {
    bgColor = "bg-accent/10";
    Icon = Bed;
  }

  const formatTitle = (title: string) => {
    return title.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className={`${bgColor} group flex items-start gap-4 rounded-lg border border-glass-border p-3 transition-colors hover:border-accent/40`}>
      <div className="flex flex-col items-center gap-1 w-16 shrink-0 mt-0.5">
        <div className="text-text-secondary text-sm font-medium whitespace-nowrap">
          {activity.time}
        </div>
        <div className="rounded-md bg-bg-primary/60 p-1.5 text-text-secondary transition-colors group-hover:text-text-primary">
          <Icon size={14} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 flex-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-text-primary font-medium">{formatTitle(activity.title)}</span>
          {activity.cost > 0 && (
            <span className="text-text-primary text-sm font-medium shrink-0">
              {formatCurrency(activity.cost, currency)}
            </span>
          )}
        </div>
        <span className="text-text-secondary text-sm leading-relaxed">{activity.description}</span>
        
        <div className="flex items-center gap-2 mt-1.5">
          {activity.bookingRequired && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse"></span>
              <span className="text-[11px] font-medium text-accent">
                {t.tripViewer.bookingRequired}
              </span>
            </div>
          )}
          {activity.rating && (
            <span className="flex items-center gap-1 rounded border border-glass-border bg-glass-bg px-2 py-0.5 text-[11px] font-medium text-text-primary">
              <Star size={10} className="text-warning" fill="currentColor" /> {activity.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
