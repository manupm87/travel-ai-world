import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import SocialProof from "./SocialProof";
import en from "@/i18n/en";

const s = en.socialProof;

describe("SocialProof", () => {
  it("renders the section label and every stat", () => {
    renderWithProviders(<SocialProof />);
    expect(screen.getByText(s.label)).toBeInTheDocument();
    for (const stat of s.stats) {
      expect(screen.getByText(stat.value)).toBeInTheDocument();
      expect(screen.getByText(stat.label)).toBeInTheDocument();
    }
  });

  it("renders every testimonial with its author, location and stars", () => {
    renderWithProviders(<SocialProof />);
    for (const testimonial of s.testimonials) {
      expect(screen.getByText(new RegExp(testimonial.quote.slice(0, 30)))).toBeInTheDocument();
      expect(screen.getByText(testimonial.author)).toBeInTheDocument();
      expect(screen.getByText(testimonial.location)).toBeInTheDocument();
    }
    const fiveStars = s.testimonials.filter((t) => t.stars === 5).length;
    expect(screen.getAllByText("★★★★★")).toHaveLength(fiveStars);
  });

  it("highlights exactly the testimonials flagged in the dictionary", () => {
    const { container } = renderWithProviders(<SocialProof />);
    const highlighted = Array.from(container.querySelectorAll("[data-highlight]"));
    const expected = s.testimonials.filter((t) => t.highlight).map((t) => t.author);
    expect(highlighted).toHaveLength(expected.length);
    for (const author of expected) {
      expect(highlighted.some((el) => el.textContent?.includes(author))).toBe(true);
    }
  });
});
