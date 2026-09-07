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

  it('lets a consumer padding win over the default', () => {
    const { container } = render(<Card className="p-8">Padded</Card>)
    const cardDiv = container.firstChild as HTMLElement
    expect(cardDiv.className).toContain('p-8')
    expect(cardDiv.className).not.toContain('p-6')
  })

  it('exposes highlight as a state attribute', () => {
    const { container } = render(<Card highlight>Highlighted</Card>)
    expect(container.firstChild).toHaveAttribute('data-highlight', 'true')
    const plain = render(<Card>Plain</Card>)
    expect(plain.container.firstChild).not.toHaveAttribute('data-highlight')
  })
})
