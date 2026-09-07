import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LANGUAGES } from "@/i18n";
import en from "@/i18n/en";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    document.documentElement.lang = "en";
  });

  it("lists every language from LANGUAGES in the dropdown", () => {
    renderWithProviders(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.selectLanguage }));

    const items = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
    expect(items.map((el) => el.textContent)).toEqual(
      LANGUAGES.map((l) => `${l.flag}${l.nativeName}`)
    );
    expect(items[0]).toHaveAttribute("aria-checked", "true");
  });

  it("renders the segmented variant as a pressed-button group", () => {
    renderWithProviders(<LanguageSwitcher variant="segmented" />);
    const group = screen.getByRole("group", { name: en.nav.selectLanguage });
    const english = within(group).getByRole("button", { name: "English" });
    const spanish = within(group).getByRole("button", { name: "Español" });
    expect(english).toHaveAttribute("aria-pressed", "true");
    expect(spanish).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(spanish);
    expect(spanish).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("es");
  });
});
