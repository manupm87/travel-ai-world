import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { PromptComposer } from "./PromptComposer";

function renderComposer(props: Partial<Parameters<typeof PromptComposer>[0]> = {}) {
  return renderWithProviders(
    <PromptComposer
      value=""
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      textareaRef={createRef<HTMLTextAreaElement>()}
      onResize={vi.fn()}
      isStreaming={false}
      canSubmit={false}
      unavailable={false}
      {...props}
    />
  );
}

const textbox = () => screen.getByRole("textbox", { name: en.planner.title });

describe("PromptComposer", () => {
  it("starts 72px tall by default", () => {
    renderComposer();
    expect(textbox().className).toContain("min-h-[72px]");
    expect(textbox().className).not.toContain("min-h-11");
  });

  it("starts one row tall when compact, and grows back to 72px from lg up", () => {
    renderComposer({ compact: true });
    expect(textbox().className).toContain("min-h-11");
    expect(textbox().className).toContain("lg:min-h-[72px]");
  });

  it("shows the keyboard hint, which hides itself on a narrow screen", () => {
    renderComposer();
    const hint = screen.getByText(en.planner.sendHint);
    expect(hint.className).toContain("hidden");
    expect(hint.className).toContain("sm:inline");
  });

  it("always announces that the planner is unavailable, hint or no hint", () => {
    renderComposer({ unavailable: true });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(en.planner.unavailable);
    expect(status.className).not.toContain("hidden");
    expect(screen.queryByText(en.planner.sendHint)).toBeNull();
  });
});
