import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import PlannerCard from './PlannerCard'

// Mock LanguageContext
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      planner: {
        label: 'AI PLANNER',
        title: 'Plan your next trip',
        destination: 'Destination',
        destinationPlaceholder: 'Where to?',
        dates: 'Dates',
        datesPlaceholder: 'When?',
        budget: 'Budget',
        budgetPlaceholder: 'How much?',
        travelers: 'Travelers',
        travelersPlaceholder: 'Who?',
        travelStyle: 'Style',
        styles: [
          { label: 'Adventure', emoji: '⛰️' },
          { label: 'Relax', emoji: '🏖️' }
        ],
        generate: 'Generate Itinerary',
        comingSoon: 'Coming Soon!',
        comingSoonNote: 'This feature is under development.'
      }
    }
  })
}))

// Mock SectionLabel to avoid potential rendering issues in isolation
vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: any) => <div data-testid="section-label">{children}</div>
}))

describe('PlannerCard', () => {
  it('renders the form correctly', () => {
    render(<PlannerCard />)
    
    expect(screen.getByText('Plan your next trip')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Where to?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('When?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('How much?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Who?')).toBeInTheDocument()
    expect(screen.getByText('Adventure')).toBeInTheDocument()
  })

  it('updates form values on input change', () => {
    render(<PlannerCard />)
    const destinationInput = screen.getByPlaceholderText('Where to?') as HTMLInputElement
    
    fireEvent.change(destinationInput, { target: { value: 'Japan' } })
    expect(destinationInput.value).toBe('Japan')
  })

  it('toggles travel styles on click', () => {
    render(<PlannerCard />)
    const adventureBtn = screen.getByRole('button', { name: /Adventure/i })
    
    expect(adventureBtn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(adventureBtn)
    expect(adventureBtn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(adventureBtn)
    expect(adventureBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows loading state on submit and then success state', async () => {
    vi.useFakeTimers()
    render(<PlannerCard />)
    
    const submitBtn = screen.getByRole('button', { name: /Generate Itinerary/i })
    fireEvent.click(submitBtn)
    
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveClass('animate-pulse')
    
    // Fast-forward simulation
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    
    expect(screen.getByText('Coming Soon!')).toBeInTheDocument()
    expect(screen.getByText('This feature is under development.')).toBeInTheDocument()
    
    vi.useRealTimers()
  })

  it('applies transparent styles when prop is provided', () => {
    const { container } = render(<PlannerCard transparent />)
    const section = container.querySelector('section')
    expect(section).toHaveClass('bg-transparent')
    expect(section).toHaveClass('py-12')
  })
})
