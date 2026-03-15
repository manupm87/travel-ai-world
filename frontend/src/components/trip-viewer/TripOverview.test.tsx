import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TripOverview from './TripOverview'
import { Trip } from '@/types/trip'

// Mock components
vi.mock('@/components/ui/Section', () => ({
  Section: ({ children }: any) => <section>{children}</section>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: any) => <div>{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>
}))

// Mock utils
vi.mock('@/utils/format', () => ({
  formatDate: (date: string) => date,
  formatDuration: (duration: string) => duration
}))

// Mock LanguageContext
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
    { id: 'a1', name: 'Le Cinema Hotel', rating: 4.5, city: 'Cannes', countryCode: 'FR', checkIn: 'June 1', checkOut: 'June 5' }
  ],
  transportation: [
    { id: 't1', fromCity: 'Nice', toCity: 'Cannes', type: 'train', provider: 'SNCF', departureTime: '10:00', arrivalTime: '10:30', duration: '30m' }
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
