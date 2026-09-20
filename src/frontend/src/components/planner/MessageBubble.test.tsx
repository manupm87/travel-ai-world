import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders the assistant's Markdown: bold, a bulleted list and a link", () => {
    renderWithProviders(
      <MessageBubble
        message={{
          role: "assistant",
          content:
            "**See:**\n\n- **Margaret Island** — a park\n- Thermal baths\n\n[Wikivoyage](https://en.wikivoyage.org/wiki/Budapest)",
        }}
      />
    );

    expect(screen.getByText("See:").tagName).toBe("STRONG");
    expect(screen.getByText("Margaret Island").tagName).toBe("STRONG");

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Margaret Island — a park");
    expect(items[1]).toHaveTextContent("Thermal baths");
    expect(screen.getByRole("list").tagName).toBe("UL");

    // None of the Markdown characters reach the traveller.
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByText(/^- /)).toBeNull();
  });

  it("opens links in a new tab safely", () => {
    renderWithProviders(
      <MessageBubble
        message={{ role: "assistant", content: "See [the guide](https://example.com/guide)." }}
      />
    );

    const link = screen.getByRole("link", { name: "the guide" });
    expect(link).toHaveAttribute("href", "https://example.com/guide");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders an ordered list and headings as bold paragraphs, never an h1", () => {
    renderWithProviders(
      <MessageBubble
        message={{ role: "assistant", content: "# Day 1\n\n1. Castle Hill\n2. Dinner" }}
      />
    );

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Day 1").tagName).toBe("P");
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("never renders raw HTML from the model", () => {
    renderWithProviders(
      <MessageBubble
        message={{ role: "assistant", content: "Careful <img src=x onerror=alert(1)> here" }}
      />
    );

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/Careful/)).toBeInTheDocument();
  });

  it("leaves what the user typed unparsed", () => {
    renderWithProviders(
      <MessageBubble message={{ role: "user", content: "**not bold** and - not a list" }} />
    );

    expect(screen.getByText("**not bold** and - not a list")).toBeInTheDocument();
    expect(document.querySelector("strong")).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("shows the typing dots, and no text, while an empty assistant bubble is pending", () => {
    const { container } = renderWithProviders(
      <MessageBubble message={{ role: "assistant", content: "" }} isPending />
    );

    expect(container.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    // The three pulsing dots: aria-hidden, so there is no role to ask for.
    expect(container.querySelectorAll("span[aria-hidden='true'] > span")).toHaveLength(3);
  });

  it("shows the error text in an alert instead of an answer", () => {
    renderWithProviders(
      <MessageBubble message={{ role: "assistant", content: "" }} errorText="Something failed" />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
  });
});
