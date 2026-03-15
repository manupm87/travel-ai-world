import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

describe('Smoke Test', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2)
  })

  it('should render a simple component', () => {
    render(<div data-testid="test-div">Hello</div>)
    expect(screen.getByTestId('test-div')).toHaveTextContent('Hello')
  })
})
