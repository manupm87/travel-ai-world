"use client";

import React, { useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Trip, ItineraryDay, Activity } from "@/types/trip";

interface ItineraryProps {
  trip: Trip;
}

export default function Itinerary({ trip }: ItineraryProps) {
  const [filter, setFilter] = useState<string>("all");
  
  const getDestinationFlag = (destId: string) => {
    const code = trip.destinations.find(d => d.id === destId)?.countryCode;
    if (code === "FR") return "🇫🇷";
    if (code === "IT") return "🇮🇹";
    if (code === "ES") return "🇪🇸";
    return "";
  };

  const filteredItinerary = trip.itinerary.filter(day => {
    if (filter === "all") return true;
    return day.destinationId === filter;
  });

  return (
    <section className="w-full bg-bg-secondary py-[60px]">
      <Container className="flex flex-col gap-8">
        {/* Destination Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button 
            onClick={() => setFilter("all")}
            className={`px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors ${
              filter === "all" ? "bg-accent text-white" : "bg-white/10 text-white/90 hover:bg-white/20"
            }`}
          >
            All Days
          </button>
          {trip.destinations.map(dest => (
            <button
              key={dest.id}
              onClick={() => setFilter(dest.id)}
              className={`px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors flex items-center gap-2 ${
                filter === dest.id ? "bg-accent text-white" : "bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              <span className="font-normal">{getDestinationFlag(dest.id)}</span>
              <span>{dest.city}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Your Itinerary</SectionLabel>
          <h3 className="text-white text-[42px] font-bold tracking-[-1px] leading-[1.1]">
            Your {trip.dates.durationDays}-Day Journey
          </h3>
        </div>

        <div className="flex flex-col gap-4 mt-4">
          {filteredItinerary.map(day => (
            <DayCard key={day.dayNumber} day={day} currency={trip.budget.currency} />
          ))}
        </div>
      </Container>
    </section>
  );
}

function DayCard({ day, currency }: { day: ItineraryDay; currency: string }) {
  const [expanded, setExpanded] = useState(false);
  
  const isFreeDay = day.title.toLowerCase().includes("free day");
  const hasTravel = day.activities.some(a => a.category === "transport");
  
  let primaryColor = "bg-accent";
  let textColor = "text-accent";
  let badgeText = "";
  
  if (isFreeDay) {
    primaryColor = "bg-purple";
    textColor = "text-purple";
    badgeText = "FREE DAY";
  } else if (hasTravel) {
    primaryColor = "bg-gold";
    textColor = "text-gold";
    badgeText = "TRAVEL";
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <Card className={`transition-all rounded-[20px] ${expanded ? "ring-1 ring-border-soft" : ""}`}>
      {/* Header */}
      <div 
        className="flex gap-4 cursor-pointer items-start" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`${primaryColor} w-12 h-12 rounded-full flex items-center justify-center shrink-0`}>
          <span className="text-white text-xl font-bold">{day.dayNumber}</span>
        </div>
        
        <div className="flex-1 flex flex-col gap-1">
          {badgeText && (
            <div className={`text-[9px] font-bold tracking-[1.5px] px-2.5 py-1 rounded-full w-fit mb-1 ${primaryColor}/20`}>
              <span className={textColor}>{badgeText}</span>
            </div>
          )}
          
          <h4 className="text-white text-xl font-bold">{day.title}</h4>
          <p className="text-text-secondary text-sm">
            {formatDate(day.date)} • {day.estimatedCost > 0 ? `${formatCurrency(day.estimatedCost)} estimated` : "Self-planned"}
          </p>
        </div>
        
        <div className="text-text-secondary text-xs pt-2">
          {expanded ? "▼" : "▶"}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="pl-16 flex flex-col gap-6 mt-2 pb-2">
          <p className="text-white/80 text-sm leading-relaxed">{day.description}</p>
          
          {day.activities.length > 0 && (
            <div className="flex flex-col gap-3">
              {day.activities.map(act => (
                <ActivityItem key={act.id} activity={act} currency={currency} />
              ))}
            </div>
          )}
          
          {day.meals.length > 0 && (
            <div className="flex flex-col gap-3 mt-2">
              <h5 className="text-text-secondary text-xs font-bold uppercase tracking-wider">Dining</h5>
              {day.meals.map(meal => (
                <div key={meal.id} className="bg-white/5 rounded-lg p-4 flex gap-4">
                  <div className="text-text-secondary text-sm font-semibold w-16">{meal.time}</div>
                  <div className="flex flex-col">
                    <span className="text-white font-semibold">{meal.restaurantName}</span>
                    <span className="text-text-secondary text-sm">{meal.cuisine} • {formatCurrency(meal.estimatedCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ActivityItem({ activity, currency }: { activity: Activity; currency: string }) {
  let bgColor = "bg-white/5";
  if (activity.category === "transport") bgColor = "bg-gold/10";
  if (activity.category === "accommodation") bgColor = "bg-accent/10";

  return (
    <div className={`${bgColor} rounded-lg p-4 flex gap-4 items-start`}>
      <div className="text-text-secondary text-sm font-semibold w-16 shrink-0 mt-0.5 whitespace-nowrap">
        {activity.time}
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-white font-semibold">{activity.title}</span>
          {activity.cost > 0 && (
            <span className="text-white/90 text-sm font-medium shrink-0">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(activity.cost)}
            </span>
          )}
        </div>
        <span className="text-text-secondary text-sm leading-relaxed">{activity.description}</span>
        
        <div className="flex items-center gap-2 mt-2">
          {activity.bookingRequired && (
            <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded">Booking Required</span>
          )}
          {activity.rating && (
            <span className="text-[11px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded flex items-center gap-1">
              ★ {activity.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
