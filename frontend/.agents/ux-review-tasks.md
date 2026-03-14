# UX & UI Improvement Tasks

Based on a thorough audit of the site by a frontend user experience expert, the following issues have been identified and need to be addressed to ensure a premium, professional, and accessible web application.

## 1. Mobile Responsiveness & Layout (Critical)
- [x] **Navbar Mobile Layout:** On screens < 768px, navbar elements (Logo, Language Switcher, Dashboard link, Plan My Trip button) collide. **Task:** Implement a standard Hamburger menu for mobile. Use a compact language switcher and hide secondary links inside the drawer.
- [x] **Typography Scaling:** Hero titles and section headings are too large for mobile viewports. **Task:** Implement responsive typography (e.g., Tailwind’s `text-3xl md:text-5xl`) to ensure headers scale down appropriately.
- [x] **Floating "Mouse" Icon Positioning:** The decorative mouse scroll icon uses absolute/fixed positioning incorrectly, causing it to overlap with section titles on mobile. **Task:** Fix its positioning to respect document flow, or remove it entirely to reduce visual noise.

## 2. Navigation & User Flow
- [x] **Recursive Dashboard Navigation:** The "My Dashboard" link remains visible in the navbar even when the user is already on the dashboard. **Task:** Change "My Dashboard" to "Home" or "Explore" when the user is on the `/dashboard` route.
- [x] **Anchor Link Smoothness & Offset:** Anchor links ("How It Works", "Features") sometimes land between sections. **Task:** Ensure `scroll-behavior: smooth` is applied globally and add `scroll-margin-top` to section IDs to account for the sticky navbar height.

## 3. Visual Design & Consistency
- [x] **Professional Iconography:** The "Features" section uses emojis (🧠, 📅, 💰), which looks unpolished and varies by OS. **Task:** Replace emojis with professional SVG icons from a library like Lucide-React or Heroicons.
- [x] **Language Switcher UI:** The current language switcher uses two separate buttons with flags, which is non-standard. **Task:** Implement a Segmented Control (pill-shaped toggle) where the background slides between "EN" and "ES" to clearly indicate the active state.
- [x] **Footer Hierarchy:** Footer category headers lack visual weight. **Task:** Bold the category headers and increase their color contrast to distinguish them from the links below.

## 4. Accessibility & Typography
- [x] **Illegible Label Sizes:** Small labels (e.g., "PLAN YOUR TRIP", "TRAVEL STYLE") are set to 10px. **Task:** Increase minimum font size for labels to at least 12px and ensure a minimum letter-spacing of 0.05em for uppercase text.
- [x] **Input Contrast:** Placeholder text in the "Plan Your Trip" form uses a color (e.g., `white/30`) that fails WCAG contrast requirements on dark backgrounds. **Task:** Increase placeholder text opacity to `white/50` or `white/60`.
- [x] **Button Consistency:** Buttons in the "Travel Style" section have different padding and sizing than the primary CTA buttons. **Task:** Standardize button heights, padding, and text sizing across the application.

## 5. Interaction Polishing
- [x] **Dashboard Empty State:** If a user has no trips, the dashboard might look empty. **Task:** Design and implement a "First Trip" empty state with a friendly illustration and a clear "Start Planning" CTA.
- [x] **Form Submission Loading State:** The "Generate" button lacks a clear loading feedback mechanism when clicked. **Task:** Add a loading spinner or an "AI is thinking..." animation/text to the button state upon submission to manage user expectations.

## 6. Trip Details Page Specifics
- [x] **Header Mobile Polish:** Fix top header layout so elements do not overlap on mobile. Make the "Back to Dashboard" button more prominent. Scale down the large main trip title on mobile devices.
- [x] **Itinerary Sorting (Critical):** Ensure all activities within a single day are strictly sorted in chronological order (currently appearing out of order).
- [x] **Trip Timeline Consolidation:** Merge the seemingly redundant "Journey Map" and "Route Overview" into a single, cohesive, interactive timeline component to reduce unnecessary vertical scrolling. Make route dots interactive.
- [x] **Sticky Itinerary Filters:** Make the city-based itinerary filters sticky (or place them higher) so users can easily jump between cities.
- [x] **Data Formatting & Iconography:** Eradicate snake_case data (change "Metro_pass" to "Metro Pass"). Replace text-based star ratings ("4.7 ★") with genuine SVG icons. Add standard travel icons (Plane, Bed, Fork/Knife) to the itinerary items for enhanced scanning. Refine the green "Planned" status badge indicator.
- [x] **Layout Compression & Responsiveness:** Reduce excessive vertical padding in Accommodation & Transport lists. Ensure Budget cards wrap correctly onto a grid on mobile. Re-layout "AI Insights" to utilize horizontal space effectively (e.g., a 2-column grid on desktop).
