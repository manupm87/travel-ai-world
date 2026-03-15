import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Button } from './Button'

describe('Button', () => {
  it('renders correctly as a button', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('bg-accent') // default variant
  })

  it('renders correctly as a link when href is provided', () => {
    render(<Button href="/dashboard">Go to Dashboard</Button>)
    const link = screen.getByRole('link', { name: /go to dashboard/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('applies the correct variant classes', () => {
    const { rerender } = render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-white/5')
    
    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-transparent')
    
    rerender(<Button variant="white">White</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-white')
  })

  it('applies the correct size classes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-5')
    
    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-12')
  })
})
