# Next.js App Router Directory (`/app`)

## Purpose
This directory is the heart of the Next.js **App Router**. It uses file-system based routing, meaning that the folders and files you place here directly determine the URLs (routes) of the application.

## Key Concepts
1. **Routing**: A folder like `dashboard` creates a `/dashboard` route.
2. **Special Files**:
   - `page.tsx`: The actual UI content for a specific route.
   - `layout.tsx`: Shared UI (like navigation bars or footers) that wraps pages and nested layouts.
   - `loading.tsx`: A fallback UI shown while the page content is fetching.
   - `error.tsx`: The UI to display if something crashes in this route.
   - `not-found.tsx`: The UI shown for 404 errors.
   - `globals.css`: The global stylesheet.

## Why is it separate from `/components`?
The files in `/app` should focus strictly on **routing, page layout, and data fetching** for that specific URL. They act as the "entry points".
Actual reusable UI pieces (like a button, a form, or a travel card) are kept in `/components` to keep the routing files clean and to promote reusability across different pages.
