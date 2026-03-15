import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Section } from './Section'

describe('Section', () => {
  it('renders children correctly', () => {
    render(<Section>Section Content</Section>)
    expect(screen.getByText('Section Content')).toBeInTheDocument()
  })

  it('applies the correct variant classes', () => {
    const { rerender, container } = render(<Section variant="primary">Primary</Section>)
    expect(container.firstChild).toHaveClass('bg-bg-primary')
    
    rerender(<Section variant="secondary">Secondary</Section>)
    expect(container.firstChild).toHaveClass('bg-bg-secondary')
  })

  it('applies the correct padding classes', () => {
    const { rerender, container } = render(<Section padding="small">Small</Section>)
    expect(container.firstChild).toHaveClass('py-6')
    
    rerender(<Section padding="xlarge">XLarge</Section>)
    expect(container.firstChild).toHaveClass('py-20')
  })

  it('renders a Container inside', () => {
    const { container } = render(<Section>Content</Section>)
    const innerContainer = container.querySelector('.max-w-\\[1440px\\]')
    expect(innerContainer).toBeInTheDocument()
  })
})
