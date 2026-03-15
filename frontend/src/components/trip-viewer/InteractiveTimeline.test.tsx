import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import InteractiveTimeline from './InteractiveTimeline'
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
  formatDate: (date: string) => date
}))

vi.mock('@/utils/countryFlag', () => ({
  getFlag: (code: string) => `Flag-${code}`
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Navigation: () => <div data-testid="nav-icon" />,
}))

// Mock LanguageContext
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
    { id: '1', city: 'Paris', countryCode: 'FR', arrivalDate: 'May 1', departureDate: 'May 4', nightsStaying: 3, activities: [] },
    { id: '2', city: 'Lyon', countryCode: 'FR', arrivalDate: 'May 4', departureDate: 'May 6', nightsStaying: 2, activities: [] },
  ]
}

describe('InteractiveTimeline', () => {
  it('renders destination nodes and initial active panel', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Route Overview')).toBeInTheDocument()
    const cityLabels = screen.getAllByText(/Paris|Lyon/)
    expect(cityLabels.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Flag-FR')).toHaveLength(2)
    
    // Initial active panel should be Paris (first dest)
    expect(screen.getByRole('heading', { level: 4, name: 'Paris' })).toBeInTheDocument()
  })

  it('switches active destination on click', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    
    const destButtons = screen.getAllByRole('button') // Just get all buttons
    fireEvent.click(destButtons[1]) // Click second button (Lyon)
    
    expect(screen.getByRole('heading', { level: 4, name: 'Lyon' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4, name: 'Paris' })).not.toBeInTheDocument()
  })

  it('renders view itinerary button', () => {
    render(<InteractiveTimeline trip={mockTrip as Trip} />)
    expect(screen.getByText('View Itinerary')).toBeInTheDocument()
  })
})
