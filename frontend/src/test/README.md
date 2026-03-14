# Testing Configurations & Utilities (`/test`)

## Purpose
This directory contains everything needed to ensure the application works as expected. It separates test setup, global mock data, and test utilities from the actual component or service code they are testing.

## Contents
- **Global Setup**: Files that run before or after every test suite (e.g., configuring a global virtual DOM like jsdom, setting up a mock server like MSW).
- **Custom Matchers**: Custom assertions for your testing framework (e.g., Jest or Vitest) to make tests more readable.
- **Test Utilities**: Helper functions specifically designed for testing, such as rendering a component wrapped in all necessary Context providers (`renderWithProviders`).

## Where do actual tests live?
The test *specifications* (the `*.test.tsx` or `*.spec.ts` files) themselves should generally live alongside the file they are testing. For example:
- `/components/Button.tsx`
- `/components/Button.test.tsx`

This colocation makes it obvious when a file is missing tests. The `/test` directory is reserved for global, shared testing infrastructure.
