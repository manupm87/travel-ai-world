import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Card } from './Card'

describe('Card', () => {
  it('renders children correctly', () => {
    render(<Card>Card Content</Card>)
    expect(screen.getByText('Card Content')).toBeInTheDocument()
  })

  it('applies basic classes', () => {
    const { container } = render(<Card>Content</Card>)
    const cardDiv = container.firstChild as HTMLElement
    expect(cardDiv.className).toContain('bg-bg-card')
    expect(cardDiv.className).toContain('rounded-2xl')
  })

  it('applies highlight styles when highlight prop is true', () => {
    const { container } = render(<Card highlight>Highlighted Card</Card>)
    const cardDiv = container.firstChild as HTMLElement
    expect(cardDiv.className).toContain('border-accent-border')
    expect(cardDiv.className).toContain('bg-accent-soft')
  })
})
