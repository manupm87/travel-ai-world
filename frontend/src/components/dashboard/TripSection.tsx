import { TripSummary } from "@/types/trip-summary";
import TripCard from "@/components/ui/TripCard";
import { SectionLabel } from "@/components/ui/SectionLabel";

export interface TripSectionProps {
  title: string;
  trips: TripSummary[];
  transparent?: boolean;
}


/**
 * Dynamic Trip Grid Section.
 * 
 * Renders a labeled section (e.g., "Planned Trips") containing a responsive
 * grid of `TripCard` components. If the provided `trips` array is empty,
 * the section entirely hides itself.
 * 
 * @param title - The uppercase SectionLabel to display above the grid.
 * @param trips - Array of TripSummary objects to render.
 * @param transparent - If true, removes the background color.
 */
export function TripSection({ title, trips, transparent }: TripSectionProps) {
  if (trips.length === 0) return null;
  
  return (
    <div className={`w-full ${transparent ? "bg-transparent" : "bg-bg-secondary"} py-20`}>
      <section className="max-w-[1440px] w-full mx-auto px-8 lg:px-16 flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <SectionLabel>{title}</SectionLabel>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      </section>
    </div>
  );
}
