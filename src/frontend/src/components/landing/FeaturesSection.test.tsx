import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import FeaturesSection from "./FeaturesSection";
import en from "@/i18n/en";

const f = en.features;

describe("FeaturesSection", () => {
  it("renders the headline and every feature", () => {
    renderWithProviders(<FeaturesSection />);

    expect(screen.getByText(f.label)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(f.title.replace("\n", " "));
    const titles = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(titles).toEqual(f.items.map((item) => item.title));
    for (const item of f.items) {
      expect(screen.getByText(item.description)).toBeInTheDocument();
    }
  });

  it("renders one icon per feature", () => {
    const { container } = renderWithProviders(<FeaturesSection />);
    expect(container.querySelectorAll("svg.lucide")).toHaveLength(f.items.length);
  });

  it("highlights only the third card", () => {
    const { container } = renderWithProviders(<FeaturesSection />);
    const highlighted = container.querySelectorAll("[data-highlight]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent(f.items[2]!.title);
  });
});
