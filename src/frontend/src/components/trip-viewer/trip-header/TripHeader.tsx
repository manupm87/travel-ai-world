import React from "react";
import { Trip } from "@/types/trip";
import { isTripStatus } from "@/types/trip-summary";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { useFormatters } from "@/hooks/useFormatters";
import { useLanguage } from "@/context/LanguageContext";
import { BudgetCard } from "./BudgetCard";
import { Calendar, Users, Wallet, ClipboardList, Download } from "lucide-react";

interface TripHeaderProps {
  trip: Trip;
}


/**
 * Trip Viewer Hero Section.
 * 
 * Renders the top section of a trip detail page. It displays the primary title,
 * overall dates, traveler count, total budget, and current status of the trip.
 * It also includes the high-level calls to action (exporting to PDF, viewing bookings).
 * 
 * @param trip - The complete Trip data object.
 */
export default function TripHeader({ trip }: TripHeaderProps) {
  const { t } = useLanguage();
  const { formatDate, formatCurrency } = useFormatters();

  const calculateTravelers = () => {
    return trip.travelers.adults + trip.travelers.children + trip.travelers.infants;
  };

  const getStatusColor = (status: string) => {
    if (status === "planned" || status === "confirmed") return "text-success bg-success/20";
    return "text-accent bg-accent/20";
  };

  // `Trip.status` is still a plain string until the view model is typed from
  // the OpenAPI contract; unknown values fall through untranslated.
  const statusLabel = isTripStatus(trip.status) ? t.status[trip.status] : trip.status;

  return (
    <section className="w-full bg-transparent pt-8 md:pt-[60px] pb-10">
      <Container className="flex flex-col gap-8">
        {/* Header Top Row */}
        <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
          {/* Header Left */}
          <div className="flex flex-col gap-5 w-full lg:w-3/4">

            
            <div className="flex flex-col gap-3">
              <h1 className="text-text-primary text-3xl md:text-5xl font-medium tracking-[-1.5px] leading-[1.1]">
                {trip.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-1">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Calendar size={14} className="text-accent" />
                  <span className="text-sm">
                    {formatDate(trip.dates.startDate)} - {formatDate(trip.dates.endDate)} ({trip.dates.durationDays} {t.tripViewer.nights.toLowerCase()})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <Users size={14} className="text-accent" />
                  <span className="text-sm">{calculateTravelers()} {t.tripViewer.travelers}</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <Wallet size={14} className="text-accent" />
                  <span className="text-sm">
                    {formatCurrency(trip.budget.total, trip.budget.currency)} {t.tripViewer.totalBudget}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex flex-col gap-4 items-start lg:items-end w-full lg:w-auto">
            <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 ${getStatusColor(trip.status)}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
              <span className="text-[11px] font-medium tracking-[1.5px] uppercase">{statusLabel}</span>
            </div>
            
            <div className="flex flex-row md:flex-row lg:flex-col gap-3 w-full md:w-auto">
              <Button className="px-5 py-3.5 rounded-xl text-white flex-1 md:flex-none">
                <ClipboardList size={18} className="mr-2" />
                <span className="text-sm font-medium">{t.tripViewer.viewBookings}</span>
              </Button>
              <Button variant="secondary" className="px-5 py-3.5 rounded-xl text-text-primary bg-bg-secondary border border-border-soft flex-1 md:flex-none">
                <Download size={18} className="mr-2" />
                <span className="text-sm font-medium">{t.tripViewer.exportPdf}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Budget Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <BudgetCard label={t.tripViewer.budgetBreakdown.accommodation} value={trip.budget.breakdown.accommodation} currency={trip.budget.currency} />
          <BudgetCard label={t.tripViewer.budgetBreakdown.food} value={trip.budget.breakdown.food} currency={trip.budget.currency} />
          <BudgetCard label={t.tripViewer.budgetBreakdown.activities} value={trip.budget.breakdown.activities} currency={trip.budget.currency} />
          <BudgetCard label={t.tripViewer.budgetBreakdown.transport} value={trip.budget.breakdown.transportation} currency={trip.budget.currency} />
        </div>
      </Container>
    </section>
  );
}
