import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Header from './Header'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

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
  LogOut: () => <div data-testid="logout-icon" />,
  User: () => <div data-testid="user-icon" />,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
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
      },
      auth: {
        login: 'Login',
        logout: 'Logout',
        loggedIn: 'Logged In'
      }
    }
  })
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollY = 0
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: vi.fn(),
      login: vi.fn(),
      isLoading: false,
    })
  })

  it('renders branding correctly and links to home', () => {
    render(<Header />)
    const logoLink = screen.getAllByText('Travel AI World')[0].closest('a')
    expect(logoLink).toHaveAttribute('href', '/')
  })

  it('does not render home link (it was removed)', () => {
    render(<Header />)
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
  })

  it('renders landing variant navigation links correctly', () => {
    render(<Header variant="landing" />)
    // Links exist in both desktop and mobile nav
    expect(screen.getAllByText('How it works')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Features')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Reviews')[0]).toBeInTheDocument()
  })

  it('highlights dashboard link when on /dashboard with or without trailing slash', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/')
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', name: 'Test', email: 'test@example.com' },
      logout: vi.fn(),
      login: vi.fn(),
      isLoading: false
    })

    render(<Header />)
    const dashboardLink = screen.getAllByText('My Dashboard')[0]
    expect(dashboardLink.closest('a')).toHaveClass('active-nav')
  })

  it('does not highlight dashboard link when on other pages', () => {
    vi.mocked(usePathname).mockReturnValue('/trip/123')
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', name: 'Test', email: 'test@example.com' },
      logout: vi.fn(),
      login: vi.fn(),
      isLoading: false
    })

    render(<Header />)
    const dashboardLink = screen.getAllByText('My Dashboard')[0]
    expect(dashboardLink.closest('a')).not.toHaveClass('active-nav')
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
