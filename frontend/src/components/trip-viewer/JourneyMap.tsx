import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Trip } from "@/types/trip";

interface JourneyMapProps {
  trip: Trip;
}

export default function JourneyMap({ trip }: JourneyMapProps) {
  return (
    <section className="w-full bg-transparent pb-10">
      <Container className="flex flex-col gap-5">
        <SectionLabel>Route Overview</SectionLabel>
        
        <Card className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden rounded-[20px]">
          {/* Simplified conceptual map with connecting lines */}
          <div className="flex flex-col md:flex-row items-center justify-between w-full relative z-10 gap-12 md:gap-4">
            
            {/* Connecting line background */}
            <div className="hidden md:block absolute top-[40%] left-[10%] right-[10%] h-0.5 bg-white/10 -z-10"></div>
            
            {trip.destinations.map((dest, i) => (
              <div key={dest.id} className="flex flex-col items-center gap-3 relative">
                <div className="w-4 h-4 rounded-full bg-accent border-[3px] border-bg-card relative z-10 shadow-[0_0_15px_rgba(79,110,247,0.5)]"></div>
                
                <div className="bg-bg-surface border border-border-soft rounded-xl p-3 flex flex-col items-center gap-1 min-w-[120px]">
                  <span className="text-2xl">{dest.countryCode === 'FR' ? '🇫🇷' : dest.countryCode === 'IT' ? '🇮🇹' : '🇪🇸'}</span>
                  <span className="text-white font-bold">{dest.city}</span>
                  <span className="text-text-secondary text-xs text-center">{dest.nightsStaying} Nights</span>
                </div>
                
                {/* Connecting line for mobile */}
                {i < trip.destinations.length - 1 && (
                  <div className="md:hidden absolute top-[100%] h-12 w-0.5 bg-white/10 -z-10 mt-[2px]"></div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </section>
  );
}
