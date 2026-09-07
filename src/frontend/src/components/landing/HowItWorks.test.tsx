import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import HowItWorks from "./HowItWorks";
import en from "@/i18n/en";

const h = en.howItWorks;

describe("HowItWorks", () => {
  it("renders the section title and every step", () => {
    renderWithProviders(<HowItWorks />);

    expect(screen.getByText(h.label)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(h.title.replace("\n", " "));
    const stepHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(stepHeadings.map((el) => el.textContent)).toEqual(h.steps.map((s) => s.title));
    for (const step of h.steps) {
      expect(screen.getByText(step.number)).toBeInTheDocument();
      expect(screen.getByText(step.description)).toBeInTheDocument();
    }
  });

  it("highlights only the first step", () => {
    const { container } = renderWithProviders(<HowItWorks />);
    const highlighted = container.querySelectorAll("[data-highlight]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent(h.steps[0]!.title);
  });

  it("renders one illustration per step with its translated alt text", () => {
    renderWithProviders(<HowItWorks />);
    const images = screen.getAllByRole("img");
    expect(images.map((img) => img.getAttribute("alt"))).toEqual(h.steps.map((s) => s.imageAlt));
  });
});
