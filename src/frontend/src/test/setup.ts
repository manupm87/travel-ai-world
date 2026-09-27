import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// The language a test picked must not follow the next one in (TRA-246).
afterEach(() => {
  if (typeof window !== 'undefined') window.localStorage?.removeItem('travel_ai_language')
})
