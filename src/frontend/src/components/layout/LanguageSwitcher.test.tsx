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

  it("switches the language from the dropdown and closes it", () => {
    renderWithProviders(<LanguageSwitcher />);
    const trigger = screen.getByRole("button", { name: en.nav.selectLanguage });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("en");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: en.nav.selectLanguage });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Español/ }));

    expect(document.documentElement.lang).toBe("es");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleccionar idioma" })).toHaveTextContent("es");
  });

  it("closes the dropdown on an outside click", () => {
    renderWithProviders(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: en.nav.selectLanguage }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
