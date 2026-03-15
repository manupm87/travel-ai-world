import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import FeaturesSection from './FeaturesSection'

// Mock components
vi.mock('@/components/ui/Container', () => ({
  Container: ({ children }: any) => <div>{children}</div>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: any) => <div data-testid="section-label">{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, highlight, className }: any) => (
    <div data-testid="card" data-highlight={highlight} className={className}>{children}</div>
  )
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Brain: () => <div data-testid="icon-0" />,
  Calendar: () => <div data-testid="icon-1" />,
  Banknote: () => <div data-testid="icon-2" />,
  Map: () => <div data-testid="icon-3" />,
  Utensils: () => <div data-testid="icon-4" />,
  Edit3: () => <div data-testid="icon-5" />,
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      features: {
        label: 'FEATURES',
        title: 'Why choose Travel AI',
        items: [
          { title: 'AI Planning', description: 'Smart itineraries' },
          { title: 'Calendar Sync', description: 'Stay organized' },
          { title: 'Budgeting', description: 'Control costs' },
        ]
      }
    }
  })
}))

describe('FeaturesSection', () => {
  it('renders section headline and items', () => {
    render(<FeaturesSection />)
    
    expect(screen.getByTestId('section-label')).toHaveTextContent('FEATURES')
    expect(screen.getByText('Why choose Travel AI')).toBeInTheDocument()
    
    expect(screen.getByText('AI Planning')).toBeInTheDocument()
    expect(screen.getByText('Smart itineraries')).toBeInTheDocument()
    expect(screen.getByText('Budgeting')).toBeInTheDocument()
  })

  it('renders correct number of feature cards', () => {
    render(<FeaturesSection />)
    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(3)
  })

  it('renders appropriate icons for each feature', () => {
    render(<FeaturesSection />)
    expect(screen.getByTestId('icon-0')).toBeInTheDocument()
    expect(screen.getByTestId('icon-1')).toBeInTheDocument()
    expect(screen.getByTestId('icon-2')).toBeInTheDocument()
  })

  it('highlights the third card (index 2)', () => {
    render(<FeaturesSection />)
    const cards = screen.getAllByTestId('card')
    expect(cards[2]).toHaveAttribute('data-highlight', 'true')
    expect(cards[0]).toHaveAttribute('data-highlight', 'false')
  })
})
