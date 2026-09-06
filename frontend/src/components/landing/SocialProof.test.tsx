import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import SocialProof from './SocialProof'

vi.mock('@/components/ui/Container', () => ({
  Container: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: { children?: React.ReactNode }) => <div data-testid="section-label">{children}</div>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, highlight, className }: { children?: React.ReactNode; highlight?: boolean; className?: string }) => (
    <div data-testid="card" data-highlight={highlight} className={className}>{children}</div>
  )
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      socialProof: {
        label: 'SOCIAL PROOF',
        stats: [
          { value: '10K+', label: 'Happy Users' },
          { value: '50+', label: 'Destinations' }
        ],
        testimonials: [
          { author: 'Jane Doe', location: 'London', stars: 5, quote: 'Amazing service!', highlight: true },
          { author: 'John Smith', location: 'NYC', stars: 4, quote: 'Very helpful.', highlight: false }
        ]
      }
    }
  })
}))

describe('SocialProof', () => {
  it('renders section label and stats', () => {
    render(<SocialProof />)
    expect(screen.getByTestId('section-label')).toHaveTextContent('SOCIAL PROOF')
    expect(screen.getByText('10K+')).toBeInTheDocument()
    expect(screen.getByText('Happy Users')).toBeInTheDocument()
  })

  it('renders testimonials with correct details', () => {
    render(<SocialProof />)
    expect(screen.getByText(/Amazing service!/i)).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('London')).toBeInTheDocument()
    
    expect(screen.getByText('★★★★★')).toBeInTheDocument()
    expect(screen.getByText('★★★★')).toBeInTheDocument()
  })

  it('applies highlight prop to cards correctly', () => {
    render(<SocialProof />)
    const cards = screen.getAllByTestId('card')
    // Stats cards (2) + Testimonials cards (2) = 4 cards
    // Testimonial 0 is highlighted
    expect(cards[2]).toHaveAttribute('data-highlight', 'true')
    expect(cards[3]).toHaveAttribute('data-highlight', 'false')
  })
})
