import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import EmptyDashboard from './EmptyDashboard'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  PlaneTakeoff: () => <div data-testid="plane-icon" />,
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      dashboard: {
        emptyTitle: 'Your atlas is waiting',
        emptyDescription: "You haven't planned any journeys yet."
      },
      planner: {
        generate: 'Plan my trip'
      }
    }
  })
}))

describe('EmptyDashboard', () => {
  it('renders correctly with translated content', () => {
    render(<EmptyDashboard />)
    expect(screen.getByText('Your atlas is waiting')).toBeInTheDocument()
    expect(screen.getByText(/You haven't planned any journeys yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Plan my trip/i })).toBeInTheDocument()
    expect(screen.getByTestId('plane-icon')).toBeInTheDocument()
  })

  it('has the correct link to the planner', () => {
    render(<EmptyDashboard />)
    const link = screen.getByRole('link', { name: /Plan my trip/i })
    expect(link).toHaveAttribute('href', '#planner')
  })
})
