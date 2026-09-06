import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TripOverview from './TripOverview'
import { Trip } from '@/types/trip'

vi.mock('@/components/ui/Section', () => ({
  Section: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
}))

vi.mock('@/utils/format', () => ({
  formatDate: (date: string) => date,
  formatDuration: (duration: string) => duration
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: {
      tripViewer: {
        tripOverview: 'Trip Overview',
        accommodations: 'Accommodations',
        transportation: 'Transportation'
      }
    }
  })
}))

const mockTrip: Partial<Trip> = {
  accommodation: [
    { id: 'a1', name: 'Le Cinema Hotel', type: 'hotel', rating: 4.5, city: 'Cannes', countryCode: 'FR', address: '1 Rue Antibes', coordinates: { lat: 43.5528, lng: 7.0174 }, checkIn: 'June 1', checkOut: 'June 5', checkInTime: '15:00', checkOutTime: '11:00', pricePerNight: 180, totalCost: 720, amenities: [] }
  ],
  transportation: [
    { id: 't1', category: 'ground', from: 'Nice-Ville', to: 'Cannes', fromCity: 'Nice', toCity: 'Cannes', type: 'train', provider: 'SNCF', departureTime: '10:00', arrivalTime: '10:30', duration: 30, cost: 12 }
  ]
}

describe('TripOverview', () => {
  it('renders accommodation details correctly', () => {
    render(<TripOverview trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Accommodations')).toBeInTheDocument()
    expect(screen.getByText('Le Cinema Hotel')).toBeInTheDocument()
    expect(screen.getByText('4.5 ★')).toBeInTheDocument()
    expect(screen.getByText(/Cannes, FR/i)).toBeInTheDocument()
    expect(screen.getByText('June 1 - June 5')).toBeInTheDocument()
  })

  it('renders transportation details correctly', () => {
    render(<TripOverview trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Transportation')).toBeInTheDocument()
    expect(screen.getByText('Nice → Cannes')).toBeInTheDocument()
    expect(screen.getByText('train')).toBeInTheDocument()
    expect(screen.getByText(/SNCF/i)).toBeInTheDocument()
    expect(screen.getByText(/10:00 - 10:30/i)).toBeInTheDocument()
  })
})
