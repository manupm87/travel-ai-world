# Utility Functions (`/utils`)

## Purpose
This directory is for small, pure JavaScript or TypeScript functions that solve common, repetitive problems without relying on React hooks or UI elements.

## Examples of Utilities
- Formatting dates (`formatDate(dateString)`)
- Currency conversion math (`convertCurrency(amount, rate)`)
- String manipulation (`capitalizeFirstLetter(string)`)
- Validation helpers (`isValidEmail(email)`)
- Deep checking objects or arrays.

## Rule of Thumb for Utilities
A function belongs in `/utils` if you could easily copy/paste that exact file into a completely different (non-React) Node.js project and it would still work perfectly. It should take an input, perform a predictable calculation or transformation, and return an output. It should not cause side effects (like updating global state or calling an API) or contain React-specific code.
