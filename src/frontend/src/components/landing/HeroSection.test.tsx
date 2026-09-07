import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import HeroSection from './HeroSection'

vi.mock('@/components/ui/Container', () => ({
  Container: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-testid="container" className={className}>{children}</div>
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, href, variant }: { children?: React.ReactNode; href?: string; variant?: string }) => <a href={href} data-variant={variant}>{children}</a>
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      hero: {
        badge: 'NEW: AI TRAVELLER',
        title: 'Discover the world with AI',
        subtitle: 'The best way to plan your next trip.',
        ctaPrimary: 'Start Planning',
        ctaSecondary: 'How it works',
        trust: ['10k+ Users', '50+ Countries', '24/7 Support'],
        imageAlt: 'Dramatic mountain landscape',
      }
    }
  })
}))

describe('HeroSection', () => {
  it('renders hero content correctly', () => {
    render(<HeroSection />)

    expect(screen.getByText('NEW: AI TRAVELLER')).toBeInTheDocument()
    expect(screen.getByText('Discover the world with AI')).toBeInTheDocument()
    expect(screen.getByText('The best way to plan your next trip.')).toBeInTheDocument()
  })

  it('renders every trust marker', () => {
    render(<HeroSection />)
    expect(screen.getByText('10k+ Users')).toBeInTheDocument()
    expect(screen.getByText('50+ Countries')).toBeInTheDocument()
    expect(screen.getByText('24/7 Support')).toBeInTheDocument()
  })

  it('renders primary and secondary CTAs', () => {
    render(<HeroSection />)
    const primaryCta = screen.getByText('Start Planning')
    const secondaryCta = screen.getByText('How it works')

    expect(primaryCta).toHaveAttribute('href', '#planner')
    expect(secondaryCta).toHaveAttribute('href', '#how-it-works')
    expect(secondaryCta).toHaveAttribute('data-variant', 'secondary')
  })

  it('renders the hero image with its translated alt text', () => {
    render(<HeroSection />)
    const img = screen.getByAltText('Dramatic mountain landscape')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', expect.stringContaining('unsplash.com'))
  })
})
