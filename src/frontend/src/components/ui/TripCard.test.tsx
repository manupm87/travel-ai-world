import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import TripCard from './TripCard'
import { LanguageProvider } from '@/context/LanguageContext'
import en from '@/i18n/en'
import { TripSummary } from '@/types/trip-summary'

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children?: React.ReactNode; href?: string; className?: string }) => (
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

const renderCard = (trip: TripSummary) =>
  render(
    <LanguageProvider>
      <TripCard trip={trip} />
    </LanguageProvider>
  )

describe('TripCard', () => {
  it('renders trip information correctly', () => {
    renderCard(mockTrip)

    expect(screen.getByText('Paris Adventure')).toBeInTheDocument()
    expect(screen.getByText('Paris, Versailles')).toBeInTheDocument()
    expect(screen.getByText('2024-05-01 - 2024-05-07')).toBeInTheDocument()
    expect(screen.getByText(en.status.planned)).toBeInTheDocument()
  })

  it('labels every status from the dictionary', () => {
    const { rerender } = renderCard(mockTrip)
    expect(screen.getByText(en.status.planned)).toHaveAttribute('data-status', 'planned')

    rerender(
      <LanguageProvider>
        <TripCard trip={{ ...mockTrip, status: 'planning' }} />
      </LanguageProvider>
    )
    expect(screen.getByText(en.status.planning)).toHaveAttribute('data-status', 'planning')

    rerender(
      <LanguageProvider>
        <TripCard trip={{ ...mockTrip, status: 'finished' }} />
      </LanguageProvider>
    )
    expect(screen.getByText(en.status.finished)).toHaveAttribute('data-status', 'finished')
  })

  it('contains the correct link to the trip page', () => {
    renderCard(mockTrip)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/trip/1')
  })

  it('renders the cover image with correct alt text', () => {
    renderCard(mockTrip)
    const img = screen.getByAltText('Paris Adventure')
    // next/image rewrites src through its loader, so match the underlying file
    expect(img).toHaveAttribute('src', expect.stringContaining('paris.jpg'))
  })
})
