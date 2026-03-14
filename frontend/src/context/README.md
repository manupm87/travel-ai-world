# Global State and Context (`/context`)

## Purpose
This directory contains React Context providers. React Context is used for sharing "global" data across the entire application, or large sections of it, without having to manually pass properties (props) down through every single component layer.

## When to use Context
- **User Authentication**: Storing whether a user is logged in, and their user profile data.
- **Theming**: Storing the current UI theme (dark mode vs light mode).
- **Global Settings/Preferences**: Storing user preferences like language or notification settings.

## Best Practices
1. **Scope**: Keep contexts focused. Instead of one massive `GlobalContext` that holds everything, create smaller, specific contexts like `AuthContext`, `ThemeContext`, `LanguageContext`.
2. **Performance**: Only put data in Context that genuinely needs to be accessed by many different unrelated components. Putting rapidly changing data in Context can cause performance issues because any component consuming that Context will re-render when the data changes.
3. **Location**: Context providers are typically wrapped around the application in `src/app/layout.tsx` or similar root layouts.
