import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import FinalCTA from './FinalCTA'

// Mock components
vi.mock('@/components/ui/Container', () => ({
  Container: ({ children, className }: any) => <div className={className}>{children}</div>
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, href, variant, className }: any) => (
    <a href={href} data-variant={variant} className={className}>{children}</a>
  )
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      finalCta: {
        title: 'Ready for your next adventure?',
        subtitle: 'Start planning with AI today.',
        ctaPrimary: 'Plan now',
        ctaSecondary: 'Learn more'
      }
    }
  })
}))

describe('FinalCTA', () => {
  it('renders headline and subtitle', () => {
    render(<FinalCTA />)
    expect(screen.getByText('Ready for your next adventure?')).toBeInTheDocument()
    expect(screen.getByText('Start planning with AI today.')).toBeInTheDocument()
  })

  it('renders CTAs with correct variants and links', () => {
    render(<FinalCTA />)
    const primaryCta = screen.getByText('Plan now')
    const secondaryCta = screen.getByText('Learn more')
    
    expect(primaryCta).toHaveAttribute('href', '#planner')
    expect(primaryCta).toHaveAttribute('data-variant', 'white')
    
    expect(secondaryCta).toHaveAttribute('data-variant', 'secondary')
  })
})
