import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import AIInsights from './AIInsights'
import { Trip } from '@/types/trip'

vi.mock('@/components/ui/Section', () => ({
  Section: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, highlight }: { children?: React.ReactNode; highlight?: boolean }) => (
    <div data-testid="card" data-highlight={highlight}>{children}</div>
  )
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      tripViewer: {
        aiInsights: 'AI INSIGHTS',
        weatherForecast: 'Weather Forecast',
        localTips: 'Local Tips'
      }
    }
  })
}))

const mockTrip: Partial<Trip> = {
  aiInsights: {
    weatherForecast: 'Sunny and warm.',
    localTips: ['Carry water', 'Use sunscreen']
  }
}

describe('AIInsights', () => {
  it('renders weather and local tips correctly', () => {
    render(<AIInsights trip={mockTrip as Trip} />)
    
    expect(screen.getByText('Weather Forecast')).toBeInTheDocument()
    expect(screen.getByText('Sunny and warm.')).toBeInTheDocument()
    expect(screen.getByText('Local Tips')).toBeInTheDocument()
    expect(screen.getByText('Carry water')).toBeInTheDocument()
    expect(screen.getByText('Use sunscreen')).toBeInTheDocument()
  })

  it('renders fallback content when insights are missing', () => {
    render(<AIInsights trip={{ aiInsights: null } as unknown as Trip} />)
    expect(screen.getByText(/Weather information currently unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/No local tips available yet/i)).toBeInTheDocument()
  })

  it('renders tips correctly when it is a single string instead of an array', () => {
    const singleTipTrip = {
      aiInsights: {
        weatherForecast: 'Rainy',
        localTips: 'Just one tip here.'
      }
    }
    render(<AIInsights trip={singleTipTrip as unknown as Trip} />)
    expect(screen.getByText('Just one tip here.')).toBeInTheDocument()
  })
})
