import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('renders with pulsing animation class', () => {
    const { container } = render(<Skeleton data-testid="skeleton" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton.className).toContain('animate-pulse')
    expect(skeleton.className).toContain('bg-bg-card')
  })

  it('applies custom className', () => {
    render(<Skeleton className="w-10 h-10" data-testid="custom-skeleton" />)
    expect(screen.getByTestId('custom-skeleton')).toHaveClass('w-10 h-10')
  })

  it('passes through custom props', () => {
    render(<Skeleton data-testid="skeleton-props" id="test-id" />)
    expect(screen.getByTestId('skeleton-props')).toHaveAttribute('id', 'test-id')
  })
})
