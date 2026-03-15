import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import HeroSection from './HeroSection'

// Mock components
vi.mock('@/components/ui/Container', () => ({
  Container: ({ children, className }: any) => <div data-testid="container" className={className}>{children}</div>
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, href, variant }: any) => <a href={href} data-variant={variant}>{children}</a>
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      hero: {
        badge: 'NEW: AI TRAVELLER',
        title: 'Discover the world with AI',
        subtitle: 'The best way to plan your next trip.',
        ctaPrimary: 'Start Planning',
        ctaSecondary: 'How it works',
        trust1: '10k+ Users',
        trust2: '50+ Countries',
        trust3: '24/7 Support'
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
    expect(screen.getByText('10k+ Users')).toBeInTheDocument()
  })

  it('renders primary and secondary CTAs', () => {
    render(<HeroSection />)
    const primaryCta = screen.getByText('Start Planning')
    const secondaryCta = screen.getByText('How it works')
    
    expect(primaryCta).toHaveAttribute('href', '#planner')
    expect(secondaryCta).toHaveAttribute('href', '#how-it-works')
    expect(secondaryCta).toHaveAttribute('data-variant', 'secondary')
  })

  it('renders the hero image', () => {
    render(<HeroSection />)
    const img = screen.getByAltText(/Dramatic mountain landscape/i)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', expect.stringContaining('unsplash.com'))
  })
})
