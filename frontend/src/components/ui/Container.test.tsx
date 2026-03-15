import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Container } from './Container'

describe('Container', () => {
  it('renders children correctly', () => {
    render(<Container>Container Content</Container>)
    expect(screen.getByText('Container Content')).toBeInTheDocument()
  })

  it('applies standard width and padding classes', () => {
    const { container } = render(<Container>Content</Container>)
    const containerDiv = container.firstChild as HTMLElement
    expect(containerDiv.className).toContain('max-w-[1440px]')
    expect(containerDiv.className).toContain('mx-auto')
    expect(containerDiv.className).toContain('px-8')
  })
})
