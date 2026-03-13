# Implementation Plan - Add Unit Testing Framework (R8)

This plan outlines the steps to introduce a unit testing framework (Vitest + React Testing Library) and implement initial test coverage for core utilities and components as requested in the architecture review.

## Proposed Changes

### Environment Setup

#### [MODIFY] [package.json](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/package.json)
- Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` to `devDependencies`.
- Add `"test:unit": "vitest"` to `scripts`.

#### [NEW] [vitest.config.ts](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/vitest.config.ts)
- Configure Vitest to use `jsdom` environment and setup React elements testing.

#### [NEW] [src/test/setup.ts](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/src/test/setup.ts)
- Setup `@testing-library/jest-dom` for Vitest.

---

### Unit Tests Implementation

#### [NEW] [src/utils/format.test.ts](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/src/utils/format.test.ts)
- Test `formatDate` and `formatCurrency` with different locales and edge cases.

#### [NEW] [src/utils/countryFlag.test.ts](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/src/utils/countryFlag.test.ts)
- Test `getFlag` with supported and unsupported country codes.

#### [NEW] [src/services/trips.test.ts](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/src/services/trips.test.ts)
- Test `getAllTripIds`, `getTripById`, and `getTripSummaries`. Mock the JSON imports if necessary.

#### [NEW] [src/components/trip-viewer/itinerary/Itinerary.test.tsx](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/src/components/trip-viewer/itinerary/Itinerary.test.tsx)
- Test filtering by day and activity type.
- Test expansion logic for day cards.

---

### Documentation Update

#### [MODIFY] [architecture-review.md](file:///home/manu/dev/github.com/manupm87/travel-ai-world/frontend/.agents/architecture-review.md)
- Mark R8 as completed.

## Verification Plan

### Automated Tests
- Run `npm run test:unit` in the `frontend` directory.
- Verify that all newly created tests pass.

### Manual Verification
- None required as this is purely a development infrastructure improvement.
