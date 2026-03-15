import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TripSection } from './TripSection'
import { TripSummary } from '@/types/trip-summary'

// Mock components used inside TripSection
vi.mock('@/components/ui/Section', () => ({
  Section: ({ children, variant, padding }: any) => (
    <section data-testid="section" data-variant={variant} data-padding={padding}>
      {children}
    </section>
  )
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: any) => <div data-testid="section-label">{children}</div>
}))

vi.mock('@/components/ui/TripCard', () => ({
  default: ({ trip }: any) => <div data-testid="trip-card">{trip.title}</div>
}))

const mockTrips: TripSummary[] = [
  { id: '1', title: 'Trip 1', destinations: ['D1'], startDate: 'S1', endDate: 'E1', status: 'planned', imageUrl: 'I1' },
  { id: '2', title: 'Trip 2', destinations: ['D2'], startDate: 'S2', endDate: 'E2', status: 'planning', imageUrl: 'I2' },
]

describe('TripSection', () => {
  it('renders correctly when there are trips', () => {
    render(<TripSection title="My Trips" trips={mockTrips} />)
    
    expect(screen.getByTestId('section-label')).toHaveTextContent('My Trips')
    const tripCards = screen.getAllByTestId('trip-card')
    expect(tripCards).toHaveLength(2)
    expect(tripCards[0]).toHaveTextContent('Trip 1')
    expect(tripCards[1]).toHaveTextContent('Trip 2')
  })

  it('returns null when there are no trips', () => {
    const { container } = render(<TripSection title="No Trips" trips={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('passes transparent prop to Section', () => {
    const { rerender } = render(<TripSection title="Title" trips={mockTrips} transparent />)
    expect(screen.getByTestId('section')).toHaveAttribute('data-variant', 'transparent')
    
    rerender(<TripSection title="Title" trips={mockTrips} transparent={false} />)
    expect(screen.getByTestId('section')).toHaveAttribute('data-variant', 'secondary')
  })
})
