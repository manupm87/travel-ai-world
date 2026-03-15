import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renders children correctly', () => {
    render(<SectionLabel>Label Content</SectionLabel>)
    expect(screen.getByText('Label Content')).toBeInTheDocument()
  })

  it('applies consistent typography classes', () => {
    const { container } = render(<SectionLabel>Label</SectionLabel>)
    const p = container.firstChild as HTMLElement
    expect(p.className).toContain('text-accent')
    expect(p.className).toContain('uppercase')
    expect(p.className).toContain('tracking-[0.1em]')
  })
})
