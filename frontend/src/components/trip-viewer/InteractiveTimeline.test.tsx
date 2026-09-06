import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import InteractiveTimeline from './InteractiveTimeline'
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
  formatDate: (date: string) => date
}))

vi.mock('@/utils/countryFlag', () => ({
  getFlag: (code: string) => `Flag-${code}`
}))

vi.mock('lucide-react', () => ({
  Navigation: () => <div data-testid="nav-icon" />,
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    t: {
      tripViewer: {
        journeyMap: 'JOURNEY MAP',
        routeOverview: 'Route Overview',
        nights: 'nights',
        viewItinerary: 'View Itinerary'
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

describe('InteractiveTimeline', () => {
  it('renders destination nodes and initial active panel', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Route Overview')).toBeInTheDocument()
    const cityLabels = screen.getAllByText(/Paris|Lyon/)
    expect(cityLabels.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Flag-FR')).toHaveLength(2)
    
    expect(screen.getByRole('heading', { level: 4, name: 'Paris' })).toBeInTheDocument()
  })

  it('switches active destination on click', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    
    const destButtons = screen.getAllByRole('button')
    fireEvent.click(destButtons[1])
    
    expect(screen.getByRole('heading', { level: 4, name: 'Lyon' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4, name: 'Paris' })).not.toBeInTheDocument()
  })

  it('renders view itinerary button', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    expect(screen.getByText('View Itinerary')).toBeInTheDocument()
  })
})
