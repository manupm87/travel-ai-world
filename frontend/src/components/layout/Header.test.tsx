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
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <div data-testid="google-login" />,
  GoogleOAuthProvider: ({ children }: any) => <>{children}</>,
  useGoogleLogin: () => vi.fn(),
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
        planMyTrip: 'Plan my trip',
        dashboard: 'Dashboard'
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

  it('renders consolidated CTA as Dashboard when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', name: 'Test', email: 'test@example.com' },
      logout: vi.fn(),
      login: vi.fn(),
      isLoading: false
    })

    render(<Header />)
    const ctaButtons = screen.getAllByText('Dashboard')
    expect(ctaButtons.length).toBeGreaterThan(0)
    expect(ctaButtons[0].closest('a')).toHaveAttribute('href', '/dashboard')
  })

  it('renders consolidated CTA as Plan my trip when not authenticated', () => {
    render(<Header />)
    const ctaButtons = screen.getAllByText('Plan my trip')
    expect(ctaButtons.length).toBeGreaterThan(0)
    expect(ctaButtons[0].closest('a')).toHaveAttribute('href', '#planner')
  })

  it('calls setLanguage when language is selected from dropdown', () => {
    render(<Header />)
    const langButtons = screen.getAllByText(/en/i)
    fireEvent.click(langButtons[0]) // Click the desktop one
    
    const esOption = screen.getByText(/español/i)
    fireEvent.click(esOption)
    expect(mockSetLanguage).toHaveBeenCalledWith('es')
  })

  it('opens login modal when clicking user icon while unauthenticated', () => {
    const { container } = render(<Header />)
    // Find User icon by the data-testid from mock
    const userIcon = screen.getByTestId('user-icon')
    fireEvent.click(userIcon.parentElement!)
    
    // LoginModal mock should be called, but since it's a real component in our tests 
    // we check if it's "open" (usually by checking for its content)
    expect(screen.getByText('Login')).toBeInTheDocument() 
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
