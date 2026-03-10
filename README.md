# Travel AI World ✈️

> AI-powered travel planning. Tell us where you want to go — our AI crafts a personalized, day-by-day itinerary in seconds.

## Project Overview

Travel AI World is a full-stack web application where users input their destination, dates, budget, group size, and travel style, and an AI generates a complete itinerary for them.

The project is split into two independent services:

| Service | Stack | Status |
|---|---|---|
| **`frontend/`** | Next.js 15 · Tailwind CSS v4 · TypeScript | ✅ In development |
| **`backend/`** | FastAPI · Python · LLM integration | 🔜 Planned |

---

## Repository Structure

```
travel-ai-world/
├── frontend/          # Next.js 15 web app (this is what runs in the browser)
├── ideas.pen          # Pencil design file — landing page mockup & design system
├── images/            # Design assets and generated images
└── README.md          # ← You are here
```

---

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See [`frontend/README.md`](./frontend/README.md) for full details.

### Backend *(coming soon)*

The FastAPI backend will live in `backend/`. It will expose REST endpoints that the frontend calls to:
- Generate itineraries via an LLM
- Store and retrieve trip data

---

## Design

The visual design is maintained in `ideas.pen` using [Pencil](https://pencil.evolus.vn/). It contains:
- The full landing page layout and design system
- Color tokens, typography, and spacing rules
- Component references for the Header, Hero, Planner Card, How It Works, Features, Social Proof, CTA, and Footer sections

---

## Roadmap

- [x] Landing page (`/`)
- [x] EN 🇬🇧 / ES 🇪🇸 i18n
- [ ] AI trip planner form (`/plan`)
- [ ] Trip itinerary viewer (`/trip/[id]`)
- [ ] FastAPI backend with LLM integration
- [ ] User accounts & saved trips
