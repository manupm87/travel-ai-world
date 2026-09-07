import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Footer from './Footer'

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children?: React.ReactNode; href?: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      footer: {
        tagline: 'AI-powered travel planning for the modern world.',
        links: [
          { title: 'Product', items: ['Features', 'Pricing'] },
          { title: 'Company', items: ['About Us', 'Contact'] },
        ],
        social: ['Twitter', 'Instagram'],
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

  it('renders link groups in order with their items', () => {
    render(<Footer />)
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['Product', 'Company'])
    expect(screen.getByText('Features')).toBeInTheDocument()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
    expect(screen.getByText('About Us')).toBeInTheDocument()
  })

  it('renders social links and copyright from the dictionary', () => {
    render(<Footer />)
    expect(screen.getByText('Twitter')).toBeInTheDocument()
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument()
    expect(screen.getByText('© 2024 Travel AI World')).toBeInTheDocument()
  })
})
