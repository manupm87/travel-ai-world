import { TripSummary } from "@/types/trip-summary";
import TripCard from "@/components/ui/TripCard";
import { SectionLabel } from "@/components/ui/SectionLabel";

export interface TripSectionProps {
  title: string;
  trips: TripSummary[];
  transparent?: boolean;
}

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
