import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TripCard from './TripCard'
import { TripSummary } from '@/types/trip-summary'

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, fill, className, sizes }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-fill={fill?.toString()} className={className} data-sizes={sizes} />
  ),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockTrip: TripSummary = {
  id: '1',
  title: 'Paris Adventure',
  destinations: ['Paris', 'Versailles'],
  startDate: '2024-05-01',
  endDate: '2024-05-07',
  status: 'planned',
  imageUrl: '/images/paris.jpg',
}

describe('TripCard', () => {
  it('renders trip information correctly', () => {
    render(<TripCard trip={mockTrip} />)
    
    expect(screen.getByText('Paris Adventure')).toBeInTheDocument()
    expect(screen.getByText('Paris, Versailles')).toBeInTheDocument()
    expect(screen.getByText('2024-05-01 - 2024-05-07')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
  })

  it('renders progress status with correct styles', () => {
    const { rerender } = render(<TripCard trip={mockTrip} />)
    const statusLabel = screen.getByText('Planned')
    expect(statusLabel).toHaveClass('text-accent')

    const planningTrip = { ...mockTrip, status: 'planning' as const }
    rerender(<TripCard trip={planningTrip} />)
    expect(screen.getByText('Planning')).toHaveClass('text-status-planning')

    const finishedTrip = { ...mockTrip, status: 'finished' as const }
    rerender(<TripCard trip={finishedTrip} />)
    expect(screen.getByText('Finished')).toHaveClass('text-text-secondary')
  })

  it('contains the correct link to the trip page', () => {
    render(<TripCard trip={mockTrip} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/trip/1')
  })

  it('renders the cover image with correct alt text', () => {
    render(<TripCard trip={mockTrip} />)
    const img = screen.getByAltText('Paris Adventure')
    expect(img).toHaveAttribute('src', '/images/paris.jpg')
  })
})
