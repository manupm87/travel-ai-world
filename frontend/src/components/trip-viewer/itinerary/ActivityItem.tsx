import { Activity } from "@/types/trip";
import { formatCurrency } from "@/utils/format";
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
  const { t, language } = useLanguage();
  let bgColor = "bg-bg-secondary";
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
    <div className={`${bgColor} border border-border-soft rounded-lg p-3 flex gap-4 items-start transition-colors hover:bg-bg-card hover:border-accent/40 group`}>
      <div className="flex flex-col items-center gap-1 w-16 shrink-0 mt-0.5">
        <div className="text-text-secondary text-sm font-medium whitespace-nowrap">
          {activity.time}
        </div>
        <div className="p-1.5 rounded-md bg-bg-primary text-text-secondary group-hover:text-text-primary transition-colors">
          <Icon size={14} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 flex-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-text-primary font-medium">{formatTitle(activity.title)}</span>
          {activity.cost > 0 && (
            <span className="text-text-primary text-sm font-medium shrink-0">
              {formatCurrency(activity.cost, currency, language === "en" ? "en-US" : "es-ES")}
            </span>
          )}
        </div>
        <span className="text-text-secondary text-sm leading-relaxed">{activity.description}</span>
        
        <div className="flex items-center gap-2 mt-1.5">
          {activity.bookingRequired && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse"></span>
              <span className="text-[10px] font-medium text-accent uppercase tracking-wider">
                {t.tripViewer.bookingRequired}
              </span>
            </div>
          )}
          {activity.rating && (
            <span className="text-[11px] font-bold text-text-primary bg-bg-secondary border border-border-soft px-2 py-0.5 rounded flex items-center gap-1">
              <Star size={10} className="text-amber-500" fill="currentColor" /> {activity.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
