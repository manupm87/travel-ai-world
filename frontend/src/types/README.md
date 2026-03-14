# Shared TypeScript Definitions (`/types`)

## Purpose
This directory contains shared interfaces, types, and enums used across the entire application to enforce strong typing using TypeScript.

## Why a separate folder?
When a type is only used by one specific component (for example, the `Props` for a `<Button />`), it should simply live at the top of that component's file.

However, many types define core business data structures that flow through multiple parts of the app:
- A `User` type might be used by a UI component to display their avatar, by the Context provider to store login state, and by a Service function to fetch their profile.
- A `Trip` type might be used by the list view, the detail view, and the API payload.

These shared types should live in the `/types` directory to ensure consistency. If the backend changes the definition of a `Trip`, you update it in `/types/trip.ts`, and TypeScript will instantly flag every place in the app where the change broke something.

## Organization
Group related types into files reflecting the domain noun they represent (e.g., `user.ts`, `api.ts`, `destination.ts`).
