/** Vitest setup: jest-dom matchers and a clean stored language per test. */

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// the language a test picked must not follow the next one in
afterEach(() => {
  if (typeof window !== 'undefined') window.localStorage?.removeItem('travel_ai_language')
})
