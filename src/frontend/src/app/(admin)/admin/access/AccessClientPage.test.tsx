import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, UnauthorizedError } from "@/services/http";
import { deleteAccessGrant, listAccessGrants, putAccessGrant, type AccessGrant } from "@/services/admin";
import { ACCESS_GRANT_PAGE } from "@/test/fixtures/admin";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import AccessClientPage, { parseLimit } from "./AccessClientPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/services/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/admin")>()),
  listAccessGrants: vi.fn(),
  putAccessGrant: vi.fn(),
  deleteAccessGrant: vi.fn(),
}));

const grant = (email: string, overrides: Partial<AccessGrant> = {}): AccessGrant => ({
  email,
  daily_token_limit: null,
  note: null,
  added_by: "admin-sub",
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
  ...overrides,
});

const table = () => screen.findByRole("table", { name: "Invited emails" });
const rows = async () => within(await table()).getAllByRole("row").slice(1);
const emailField = () => screen.getByLabelText("Email");
const limitField = () => screen.getByLabelText("Daily token limit");
const noteField = () => screen.getByLabelText("Note");
const submit = () => screen.getByRole("button", { name: "Add or update" });
const message = () => screen.getByTestId("access-message");
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe("parseLimit", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["0", 0],
    [" 1200 ", 1200],
    ["-1", "invalid"],
    ["1.5", "invalid"],
    ["many", "invalid"],
    ["99999999999999999999", "invalid"],
  ])("%j → %j", (text, expected) => {
    expect(parseLimit(text)).toBe(expected);
  });
});

describe("AccessClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAccessGrants).mockResolvedValue(ACCESS_GRANT_PAGE);
  });

  it("lists every grant with its limit said in words", async () => {
    renderWithProviders(<AccessClientPage />);

    const [ada, grace, linus] = await rows();
    expect(ada).toHaveTextContent("ada@example.com");
    expect(ada).toHaveTextContent("50,000");
    expect(ada).toHaveTextContent("team");
    expect(grace).toHaveTextContent("Unlimited");
    expect(linus).toHaveTextContent("Default");
    expect(screen.getByRole("heading", { level: 1, name: "Access" })).toBeInTheDocument();
  });

  it("reads every page of the list", async () => {
    vi.mocked(listAccessGrants)
      .mockResolvedValueOnce({ items: [grant("a@example.com")], next_cursor: "NEXT" })
      .mockResolvedValueOnce({ items: [grant("b@example.com")], next_cursor: null });

    renderWithProviders(<AccessClientPage />);

    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(vi.mocked(listAccessGrants).mock.calls.map(([cursor]) => cursor)).toEqual([null, "NEXT"]);
  });

  it("says so when nobody is invited", async () => {
    vi.mocked(listAccessGrants).mockResolvedValue({ items: [], next_cursor: null });

    renderWithProviders(<AccessClientPage />);

    expect(await table()).toHaveTextContent("Nobody has been invited yet");
  });

  it("adds an email with its limit and note, then reloads the list", async () => {
    const saved = grant("new@example.com", { daily_token_limit: 1200, note: "friend" });
    vi.mocked(putAccessGrant).mockResolvedValue(saved);
    renderWithProviders(<AccessClientPage />);
    await table();
    vi.mocked(listAccessGrants).mockResolvedValue({ items: [saved], next_cursor: null });

    type(emailField(), "  New@Example.com ");
    type(limitField(), "1200");
    type(noteField(), " friend ");
    fireEvent.click(submit());

    expect(putAccessGrant).toHaveBeenCalledWith("new@example.com", {
      daily_token_limit: 1200,
      note: "friend",
    });
    await waitFor(() => expect(message()).toHaveTextContent("new@example.com was invited."));
    expect(message()).toHaveAttribute("role", "status");
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect(emailField()).toHaveValue("");
    expect(limitField()).toHaveValue("");
    expect(noteField()).toHaveValue("");
    expect(emailField()).toHaveFocus();
  });

  it("sends an empty limit and note as null: the default applies", async () => {
    vi.mocked(putAccessGrant).mockResolvedValue(grant("plain@example.com"));
    renderWithProviders(<AccessClientPage />);
    await table();

    type(emailField(), "plain@example.com");
    fireEvent.click(submit());

    expect(putAccessGrant).toHaveBeenCalledWith("plain@example.com", { daily_token_limit: null, note: null });
  });

  it("refuses a bad email or limit before calling the API, and focuses the field", async () => {
    renderWithProviders(<AccessClientPage />);
    await table();

    type(emailField(), "not-an-email");
    fireEvent.click(submit());
    expect(message()).toHaveTextContent("Enter a valid email address.");
    expect(emailField()).toHaveFocus();
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField().getAttribute("aria-describedby")).toBe(message().id);
    expect(limitField()).not.toHaveAttribute("aria-invalid");

    // Editing the form takes the stale message, and the mark on the field, away.
    type(emailField(), "ok@example.com");
    expect(message()).toBeEmptyDOMElement();
    expect(emailField()).not.toHaveAttribute("aria-invalid");
    expect(emailField()).not.toHaveAttribute("aria-describedby");

    type(limitField(), "-5");
    fireEvent.click(submit());
    expect(message()).toHaveTextContent("The limit must be a whole number, 0 or more.");
    expect(limitField()).toHaveFocus();
    expect(limitField()).toHaveAttribute("aria-invalid", "true");
    // The hint stays in the description; the message joins it.
    const described = limitField().getAttribute("aria-describedby")!.split(" ");
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0]!)).toHaveTextContent("Leave empty for the default");
    expect(described[1]).toBe(message().id);
    expect(emailField()).not.toHaveAttribute("aria-invalid");

    expect(putAccessGrant).not.toHaveBeenCalled();
  });

  it("keeps the form and says so when saving fails", async () => {
    vi.mocked(putAccessGrant).mockRejectedValue(new ApiError(500, "boom"));
    renderWithProviders(<AccessClientPage />);
    await table();

    type(emailField(), "new@example.com");
    fireEvent.click(submit());

    await waitFor(() => expect(message()).toHaveTextContent("We couldn't save that. Please try again."));
    expect(emailField()).toHaveValue("new@example.com");
    expect(submit()).toBeEnabled();
    expect(listAccessGrants).toHaveBeenCalledTimes(1);
  });

  it("says the account is not allowed when a write answers 403", async () => {
    vi.mocked(putAccessGrant).mockRejectedValue(new ApiError(403, "no", "FORBIDDEN"));
    renderWithProviders(<AccessClientPage />);
    await table();

    type(emailField(), "new@example.com");
    fireEvent.click(submit());

    await waitFor(() => expect(message()).toHaveTextContent("isn't allowed to change the access list"));
  });

  it("has one live region, in the page from the start, and nothing nested in it", async () => {
    renderWithProviders(<AccessClientPage />);
    await table();

    expect(message()).toHaveAttribute("role", "status");
    expect(message()).toBeEmptyDOMElement();
    expect(message().closest("[aria-live]")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the rows on screen while the list is read again after a write", async () => {
    const saved = grant("new@example.com");
    vi.mocked(putAccessGrant).mockResolvedValue(saved);
    renderWithProviders(<AccessClientPage />);
    await table();
    let answer!: (page: { items: AccessGrant[]; next_cursor: null }) => void;
    vi.mocked(listAccessGrants).mockReturnValue(new Promise((resolve) => (answer = resolve)));

    type(emailField(), "new@example.com");
    fireEvent.click(submit());

    await waitFor(() => expect(listAccessGrants).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("table", { name: "Invited emails" })).toBeInTheDocument();
    expect(await rows()).toHaveLength(3);

    answer({ items: [...ACCESS_GRANT_PAGE.items, saved], next_cursor: null });
    await waitFor(async () => expect(await rows()).toHaveLength(4));
  });

  it("edit refills the form from the row and moves to the limit", async () => {
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Edit ada@example.com" }));

    expect(emailField()).toHaveValue("ada@example.com");
    expect(limitField()).toHaveValue("50000");
    expect(noteField()).toHaveValue("team");
    expect(limitField()).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Edit linus@example.com" }));
    expect(limitField()).toHaveValue("");
    expect(noteField()).toHaveValue("");
  });

  it("says it is editing: read-only email, a submit that names it, and a way out", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderWithProviders(<AccessClientPage />);
    await table();
    expect(emailField()).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Cancel edit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit ada@example.com" }));

    expect(emailField()).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Update ada@example.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add or update" })).not.toBeInTheDocument();
    expect(message()).toHaveTextContent("Editing ada@example.com");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));

    expect(emailField()).toHaveValue("");
    expect(limitField()).toHaveValue("");
    expect(noteField()).toHaveValue("");
    expect(emailField()).not.toHaveAttribute("readonly");
    expect(emailField()).toHaveFocus();
    expect(submit()).toBeInTheDocument();
    expect(message()).toBeEmptyDOMElement();
  });

  it("says a changed grant was updated, not invited, and leaves edit mode", async () => {
    vi.mocked(putAccessGrant).mockResolvedValue(grant("ada@example.com", { daily_token_limit: 70000 }));
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Edit ada@example.com" }));
    type(limitField(), "70000");
    fireEvent.click(screen.getByRole("button", { name: "Update ada@example.com" }));

    expect(putAccessGrant).toHaveBeenCalledWith("ada@example.com", { daily_token_limit: 70000, note: "team" });
    await waitFor(() => expect(message()).toHaveTextContent("Limit updated for ada@example.com."));
    expect(submit()).toBeInTheDocument();
    expect(emailField()).not.toHaveAttribute("readonly");
  });

  it("removes an email only after the confirmation", async () => {
    vi.mocked(deleteAccessGrant).mockResolvedValue();
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Remove grace@example.com" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this email?" });
    expect(dialog).toHaveTextContent("grace@example.com will stop getting in");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(deleteAccessGrant).not.toHaveBeenCalled();

    vi.mocked(listAccessGrants).mockResolvedValue({
      items: ACCESS_GRANT_PAGE.items.filter((g) => g.email !== "grace@example.com"),
      next_cursor: null,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));

    expect(deleteAccessGrant).toHaveBeenCalledWith("grace@example.com");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(message()).toHaveTextContent("grace@example.com is off the list."));
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    // The row that opened the dialog is gone: the focus lands on the form instead.
    expect(emailField()).toHaveFocus();
  });

  it("counts an email that someone else already removed (404) as removed", async () => {
    vi.mocked(deleteAccessGrant).mockRejectedValue(new ApiError(404, "gone", "NOT_FOUND"));
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Remove ada@example.com" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove access" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(message()).toHaveTextContent("ada@example.com is off the list.");
    expect(listAccessGrants).toHaveBeenCalledTimes(2);
  });

  it("cancelling the confirmation removes nothing", async () => {
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Remove ada@example.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAccessGrant).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open and says so when removing fails", async () => {
    vi.mocked(deleteAccessGrant).mockRejectedValue(new ApiError(500, "boom"));
    renderWithProviders(<AccessClientPage />);
    await table();

    fireEvent.click(screen.getByRole("button", { name: "Remove ada@example.com" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("We couldn't remove it.");
    expect(within(dialog).getByRole("button", { name: "Remove access" })).toBeEnabled();
    expect(listAccessGrants).toHaveBeenCalledTimes(1);
  });

  it("shows the forbidden state without a retry for a non-admin", async () => {
    vi.mocked(listAccessGrants).mockRejectedValue(new ApiError(403, "no", "FORBIDDEN"));

    renderWithProviders(<AccessClientPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("isn't allowed to read this");
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a retry when the list fails, and recovers", async () => {
    vi.mocked(listAccessGrants).mockRejectedValueOnce(new ApiError(500, "boom"));

    renderWithProviders(<AccessClientPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await rows()).toHaveLength(3);
  });

  it("drops the session on a 401", async () => {
    localStorage.setItem("travel_ai_user", JSON.stringify({ id: "1", email: "a@b.c", name: "A" }));
    vi.mocked(listAccessGrants).mockRejectedValue(new UnauthorizedError("expired"));

    renderWithProviders(<AccessClientPage />);

    await waitFor(() => expect(localStorage.getItem("travel_ai_user")).toBeNull());
  });
});
