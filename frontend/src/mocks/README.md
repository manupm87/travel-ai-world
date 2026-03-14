# Mock Data (`/mocks`)

## Purpose
This directory is used for storing "fake" or mock data that mimics the structure of real data returned by your backend API.

## Why use Mock Data?
1. **Development Speed**: Frontend development can proceed even if the backend API isn't built yet, or if it's currently down. You can build the UI using the mock data.
2. **Testing**: Unit and integration tests often need predictable data to ensure components behave correctly. Mock data provides a stable set of inputs for these tests, without relying on a live, changing database.
3. **Design Prototyping**: Quickly visualising how UI components will look with realistic content (e.g., long text, missing fields, different image sizes) before connecting to real data sources.

## Best Practices
- Keep mock data structures identical to the actual TypeScript types (found in `/types`) that the real API will return.
- If you use a tool like MSW (Mock Service Worker), the handlers and setup for intercepting network requests would also live here or in a closely related testing folder.
