import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import JourneyMap from './JourneyMap'
import { Trip } from '@/types/trip'

// Mock components
vi.mock('@/components/ui/Container', () => ({
  Container: ({ children }: any) => <div>{children}</div>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: any) => <div>{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>
}))

// Mock utils
vi.mock('@/utils/countryFlag', () => ({
  getFlag: (code: string) => `Flag-${code}`
}))

// Mock LanguageContext
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
    { id: '1', city: 'Paris', countryCode: 'FR', arrivalDate: 'May 1', departureDate: 'May 4', nightsStaying: 3, activities: [] as any },
    { id: '2', city: 'Lyon', countryCode: 'FR', arrivalDate: 'May 4', departureDate: 'May 6', nightsStaying: 2, activities: [] as any },
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
