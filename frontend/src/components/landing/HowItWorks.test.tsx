import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import HowItWorks from './HowItWorks'

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

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      howItWorks: {
        label: 'PROCESS',
        title: '3 Simple Steps',
        steps: [
          { number: 1, title: 'Input destination', description: 'Tell us where you want to go.' },
          { number: 2, title: 'AI Magic', description: 'Wait for our engine to work.' },
        ]
      }
    }
  })
}))

describe('HowItWorks', () => {
  it('renders section title and steps', () => {
    render(<HowItWorks />)
    
    expect(screen.getByTestId('section-label')).toHaveTextContent('PROCESS')
    expect(screen.getByText('3 Simple Steps')).toBeInTheDocument()
    
    expect(screen.getByText('Input destination')).toBeInTheDocument()
    expect(screen.getByText('AI Magic')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('highlights the first step (index 0)', () => {
    render(<HowItWorks />)
    const cards = screen.getAllByTestId('card')
    expect(cards[0]).toHaveAttribute('data-highlight', 'true')
    expect(cards[1]).toHaveAttribute('data-highlight', 'false')
  })

  it('renders step images', () => {
    render(<HowItWorks />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('alt', 'Person planning a trip on laptop')
  })
})
