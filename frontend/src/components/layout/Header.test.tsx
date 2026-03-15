import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Header from './Header'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Menu: () => <div data-testid="menu-icon" />,
  X: () => <div data-testid="x-icon" />,
}))

// Mock LanguageContext
const mockSetLanguage = vi.fn()
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: mockSetLanguage,
    t: {
      nav: {
        howItWorks: 'How it works',
        features: 'Features',
        reviews: 'Reviews',
        myDashboard: 'My Dashboard',
        home: 'Home',
        planMyTrip: 'Plan my trip'
      }
    }
  })
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollY = 0
  })

  it('renders branding correctly', () => {
    render(<Header />)
    expect(screen.getAllByText('Travel AI World')[0]).toBeInTheDocument()
  })

  it('renders landing variant navigation links', () => {
    render(<Header variant="landing" />)
    // Links exist in both desktop and mobile nav
    expect(screen.getAllByText('How it works')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Features')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Reviews')[0]).toBeInTheDocument()
  })

  it('renders dashboard variant navigation links', () => {
    render(<Header variant="dashboard" />)
    expect(screen.getAllByText('My Dashboard')[0]).toBeInTheDocument()
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()
  })

  it('calls setLanguage when language button is clicked', () => {
    render(<Header />)
    // Buttons exist in both desktop and mobile nav
    const esButtons = screen.getAllByRole('button', { name: /es/i })
    fireEvent.click(esButtons[0])
    expect(mockSetLanguage).toHaveBeenCalledWith('es')
  })

  it('applies scrolled styles when window is scrolled', () => {
    render(<Header />)
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('bg-transparent')

    // Simulate scroll
    window.scrollY = 100
    fireEvent.scroll(window)
    
    expect(header).toHaveClass('bg-bg-primary/95')
  })

  it('opens mobile menu on hamburger click', () => {
    render(<Header />)
    const hamburger = screen.getByLabelText('Open menu')
    fireEvent.click(hamburger)
    
    // Check if the mobile drawer text is visible
    expect(screen.getByText('Select Language')).toBeInTheDocument()
  })
})
