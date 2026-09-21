import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { AskComposer } from "./AskComposer";
import en from "@/i18n/en";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const ASK = "Four days in Budapest, thermal baths & wine";
const HREF = "/plan/?q=ask";

const field = () => screen.getByRole("textbox", { name: "Where next?" });
const send = () => screen.getByRole("button", { name: en.landing.send });
const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  // The placeholder types itself; reduced motion pins it to the first example,
  // so these tests assert copy instead of racing a timer.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AskComposer", () => {
  it("is one field and one action, disabled until something is typed", () => {
    renderWithProviders(<AskComposer onSubmit={() => HREF} label="Where next?" />);

    expect(field()).toHaveAttribute("placeholder", en.landing.examples[0]);
    expect(send()).toBeDisabled();
  });

  it("takes its name from the heading it is given", () => {
    renderWithProviders(
      <AskComposer onSubmit={() => HREF} labelledBy="headline">
        <h1 id="headline">Where next?</h1>
      </AskComposer>
    );

    expect(field()).toHaveAccessibleName("Where next?");
  });

  it("does nothing while the ask is only whitespace", () => {
    const onSubmit = vi.fn(() => HREF);
    renderWithProviders(<AskComposer onSubmit={onSubmit} label="Where next?" />);

    type("   ");
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends the trimmed ask and navigates where the press answers", async () => {
    const onSubmit = vi.fn(() => HREF);
    renderWithProviders(<AskComposer onSubmit={onSubmit} label="Where next?" />);

    type(`  ${ASK}  `);
    fireEvent.click(send());

    expect(onSubmit).toHaveBeenCalledWith(ASK);
    await waitFor(() => expect(push).toHaveBeenCalledWith(HREF));
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    renderWithProviders(<AskComposer onSubmit={() => HREF} label="Where next?" />);

    type(ASK);
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(push).not.toHaveBeenCalled();

    fireEvent.keyDown(field(), { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith(HREF));
  });

  it("fades out on its way to the next page, and says so on the button", async () => {
    renderWithProviders(<AskComposer onSubmit={() => HREF} label="Where next?" />);

    type(ASK);
    fireEvent.click(send());

    const leaving = screen.getByRole("button", { name: en.landing.sending });
    expect(leaving).toBeDisabled();
    expect(leaving).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("stays put when the press was taken somewhere else", () => {
    renderWithProviders(<AskComposer onSubmit={() => null} label="Where next?" />);

    type(ASK);
    fireEvent.click(send());

    expect(push).not.toHaveBeenCalled();
    // Still the field it was: the ask is there and the button can be pressed again.
    expect(field()).toHaveValue(ASK);
    expect(send()).toBeEnabled();
  });

  it("takes the focus when the page is nothing but the field", () => {
    renderWithProviders(<AskComposer onSubmit={() => HREF} label="Where next?" autoFocus />);

    expect(field()).toHaveFocus();
  });
});
