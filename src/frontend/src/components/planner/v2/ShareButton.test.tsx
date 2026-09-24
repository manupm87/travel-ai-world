import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { ShareButton } from "./ShareButton";

describe("ShareButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies the saved trip's link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderWithProviders(<ShareButton tripId="abc-123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: en.plan.share }));
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/plan/?trip=abc-123`);
    expect(screen.getByRole("button", { name: en.plan.shareCopied })).toBeInTheDocument();
  });

  it("stays quiet when there is no clipboard to write to", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderWithProviders(<ShareButton tripId="abc-123" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: en.plan.share }));
    });
    expect(screen.getByRole("button", { name: en.plan.share })).toBeInTheDocument();
  });
});
