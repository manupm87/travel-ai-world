import { AskField } from "@/components/landing/AskField";

/**
 * Root URL (`/`). The landing is the field: the question, the box you answer
 * it in, and the button that opens the planner. The header, the footer and the
 * aurora behind all three come from the `(marketing)` layout.
 */
export default function HomePage() {
  return <AskField />;
}
