import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Itinerary from './Itinerary';
import { DayCard } from './DayCard';
import type { Trip, ItineraryDay } from '@/types/trip';

// Mock Language Context
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      tripViewer: {
        allDays: 'All Days',
        journeyTitle: 'Journey Title {duration}',
        yourItinerary: 'Your Itinerary',
        freeDay: 'Free Day',
        travel: 'Travel',
        estimated: 'estimated',
        selfPlanned: 'self-planned',
        dining: 'Dining'
      }
    },
    language: 'en'
  })
}));

const mockTrip = {
  destinations: [
    { id: 'dest-1', city: 'Paris', countryCode: 'FR' },
    { id: 'dest-2', city: 'London', countryCode: 'GB' }
  ],
  dates: { durationDays: 5 },
  budget: { currency: 'EUR' },
  itinerary: [
    { dayNumber: 1, destinationId: 'dest-1', title: 'Paris Day 1', date: '2026-05-15', estimatedCost: 0, description: 'Desc 1', activities: [], meals: [] },
    { dayNumber: 2, destinationId: 'dest-1', title: 'Paris Day 2', date: '2026-05-16', estimatedCost: 0, description: 'Desc 2', activities: [], meals: [] },
    { dayNumber: 3, destinationId: 'dest-2', title: 'London Day 1', date: '2026-05-17', estimatedCost: 0, description: 'Desc 3', activities: [], meals: [] }
  ]
} as unknown as Trip;

describe('Itinerary and DayCard', () => {
  describe('Itinerary Filtering', () => {
    it('renders all days by default', () => {
      render(<Itinerary trip={mockTrip} />);
      expect(screen.getByText('Paris Day 1')).toBeInTheDocument();
      expect(screen.getByText('Paris Day 2')).toBeInTheDocument();
      expect(screen.getByText('London Day 1')).toBeInTheDocument();
    });

    it('filters by destination when a button is clicked', () => {
      render(<Itinerary trip={mockTrip} />);
      
      const parisButton = screen.getByText('Paris');
      fireEvent.click(parisButton);
      
      expect(screen.getByText('Paris Day 1')).toBeInTheDocument();
      expect(screen.getByText('Paris Day 2')).toBeInTheDocument();
      expect(screen.queryByText('London Day 1')).not.toBeInTheDocument();
    });
  });

  describe('DayCard Expansion', () => {
    const mockDay: ItineraryDay = {
      dayNumber: 1,
      destinationId: 'dest-1',
      title: 'Free Day in Paris',
      date: '2026-05-15',
      description: 'Enjoy a free day walking around the city.',
      estimatedCost: 50,
      activities: [],
      meals: []
    } as unknown as ItineraryDay;

    it('toggles description when clicked', () => {
      render(<DayCard day={mockDay} currency="EUR" />);
      
      expect(screen.queryByText('Enjoy a free day walking around the city.')).not.toBeInTheDocument();

      const header = screen.getByRole('button');
      fireEvent.click(header);

      expect(screen.getByText('Enjoy a free day walking around the city.')).toBeInTheDocument();

      fireEvent.click(header);
      expect(screen.queryByText('Enjoy a free day walking around the city.')).not.toBeInTheDocument();
    });
  });
});
