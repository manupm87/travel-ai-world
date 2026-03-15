import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Footer from './Footer'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      footer: {
        tagline: 'AI-powered travel planning for the modern world.',
        links: {
          Product: ['Features', 'Pricing'],
          Company: ['About Us', 'Contact']
        },
        copyright: '© 2024 Travel AI World'
      }
    }
  })
}))

describe('Footer', () => {
  it('renders branding and tagline', () => {
    render(<Footer />)
    expect(screen.getByText('Travel AI World')).toBeInTheDocument()
    expect(screen.getByText('AI-powered travel planning for the modern world.')).toBeInTheDocument()
  })

  it('renders link categories and labels', () => {
    render(<Footer />)
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Features')).toBeInTheDocument()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByText('Company')).toBeInTheDocument()
    expect(screen.getByText('About Us')).toBeInTheDocument()
  })

  it('renders social links and copyright', () => {
    render(<Footer />)
    expect(screen.getByText('Twitter')).toBeInTheDocument()
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('© 2024 Travel AI World')).toBeInTheDocument()
  })
})
