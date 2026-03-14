# API Services (`/services`)

## Purpose
This directory acts as the central hub for all network requests. Any communication with external APIs, backend servers, or databases should be routed through functions defined here.

## Separation of Concerns
UI components (`/app` and `/components`) should **never** make direct `fetch` or `axios` calls. They should be "dumb" regarding where the data comes from.

Instead, a component should call a service function:
```typescript
// Good: Component calls a service
import { getUserProfile } from '@/services/userService';
const profile = await getUserProfile(userId);

// Bad: Component handles fetching logic directly
const response = await fetch(`https://api.example.com/users/${userId}`);
const profile = await response.json();
```

## Benefits of Services
1. **Reusability**: If multiple parts of the app need the user profile, they all call the same `getUserProfile` service function.
2. **Maintainability**: If the API endpoint changes from `/v1/users` to `/v2/accounts`, you only have to update the URL in *one* place (the service file), not scattered across dozens of UI components.
3. **Error Handling**: You can centralize error handling, authentication token injection, and retry logic within the service layer.
4. **Testability**: It is much easier to mock a service function when unit testing a UI component than it is to intercept raw network requests.
