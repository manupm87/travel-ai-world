# UI Components (`/components`)

## Purpose
This directory houses all the **reusable React components** that make up the user interface. Unlike the `/app` folder, the folders/files here **do not** create website URLs.

## Why is it separate from `/app`?
By separating UI building blocks from the Next.js routing logic, we achieve:
1. **Reusability**: A `Button` component can be imported and used on the `/dashboard` page and the `/plan` page without duplicating code.
2. **Separation of Concerns**: The `/app` folder handles *where* the user goes and *what data* they get. The `/components` folder handles *how things look* and *how the user interacts with them*.
3. **Maintainability**: It keeps our route files (`page.tsx`) small and readable. Instead of a 1000-line page file, establishing smaller components like `<TripCard />` or `<PlannerForm />` makes the codebase easier to test and maintain.

## Structure Best Practices
Often, as a project grows, the components folder is typically subdivided:
- `/ui` (or `/common`): Generic, highly reusable pieces like Buttons, Inputs, Modals, Dialogs.
- `/landing`: Components specifically tied to the landing page (Hero, FinalCTA, etc.).
- `/trip-viewer`: Components specifically tied to viewing a trip (TripCard, Timeline, etc.).
- `/dashboard`: Components tied to the dashboard feature.

*Note: Grouping route-specific or complex components by their "domain" (feature) inside `src/components` is standard practice. It keeps the UI layer organized and cleanly separated from the Next.js URL routing files in `src/app`.*
