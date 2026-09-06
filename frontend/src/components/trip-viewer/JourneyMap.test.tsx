import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import JourneyMap from './JourneyMap'
import { Trip } from '@/types/trip'

vi.mock('@/components/ui/Container', () => ({
  Container: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
}))

vi.mock('@/utils/countryFlag', () => ({
  getFlag: (code: string) => `Flag-${code}`
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      tripViewer: {
        routeOverview: 'Route Overview',
        nights: 'nights'
      }
    }
  })
}))

const mockTrip: Partial<Trip> = {
  destinations: [
    { id: '1', city: 'Paris', country: 'France', countryCode: 'FR', coordinates: { lat: 48.8566, lng: 2.3522 }, arrivalDate: 'May 1', departureDate: 'May 4', nightsStaying: 3 },
    { id: '2', city: 'Lyon', country: 'France', countryCode: 'FR', coordinates: { lat: 45.764, lng: 4.8357 }, arrivalDate: 'May 4', departureDate: 'May 6', nightsStaying: 2 },
  ]
}

describe('JourneyMap', () => {
  it('renders all destinations correctly', () => {
    render(<JourneyMap trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Route Overview')).toBeInTheDocument()
    const cityLabels = screen.getAllByText(/Paris|Lyon/)
    expect(cityLabels.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Flag-FR')).toHaveLength(2)
  })

  it('renders correct number of nights for each destination', () => {
    render(<JourneyMap trip={mockTrip as Trip} />)
    expect(screen.getByText('3 nights')).toBeInTheDocument()
    expect(screen.getByText('2 nights')).toBeInTheDocument()
  })
})
