import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import DestinationTimeline from './DestinationTimeline'
import { Destination } from '@/types/trip'

// Mock components
vi.mock('@/components/ui/Container', () => ({
  Container: ({ children }: any) => <div data-testid="container">{children}</div>
}))

// Mock utils
vi.mock('@/utils/format', () => ({
  formatDate: (date: string) => date // Simple return for testing
}))

vi.mock('@/utils/countryFlag', () => ({
  getFlag: (code: string) => `Flag-${code}`
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: {
      tripViewer: {
        journeyMap: 'JOURNEY MAP',
        nights: 'nights'
      }
    }
  })
}))

const mockDestinations: Destination[] = [
  { id: '1', city: 'Paris', countryCode: 'FR', arrivalDate: 'May 1', departureDate: 'May 4', nightsStaying: 3, activities: [] },
  { id: '2', city: 'Lyon', countryCode: 'FR', arrivalDate: 'May 4', departureDate: 'May 6', nightsStaying: 2, activities: [] },
]

describe('DestinationTimeline', () => {
  it('renders all destinations correctly', () => {
    render(<DestinationTimeline destinations={mockDestinations} />)
    
    expect(screen.getByText('JOURNEY MAP')).toBeInTheDocument()
    const cityLabels = screen.getAllByText(/Paris|Lyon/)
    expect(cityLabels.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Flag-FR')).toHaveLength(2)
  })

  it('renders date ranges and nights staying correctly', () => {
    render(<DestinationTimeline destinations={mockDestinations} />)
    
    expect(screen.getByText('May 1 - May 4')).toBeInTheDocument()
    expect(screen.getByText('3 nights')).toBeInTheDocument()
    expect(screen.getByText('May 4 - May 6')).toBeInTheDocument()
    expect(screen.getByText('2 nights')).toBeInTheDocument()
  })

  it('highlights the first destination', () => {
    const { container } = render(<DestinationTimeline destinations={mockDestinations} />)
    const destCards = container.querySelectorAll('.flex-1')
    expect(destCards[0]).toHaveClass('bg-accent/20')
    expect(destCards[1]).toHaveClass('bg-bg-card')
  })
})
