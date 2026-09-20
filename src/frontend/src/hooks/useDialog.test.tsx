import { describe, it, expect, vi } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDialog } from "./useDialog";

/**
 * A dialog reduced to what the hook cares about: three focusables inside, one
 * opener outside, and the options under test. Every consumer in the app is a
 * dressed-up version of this.
 */
function Harness({
  open,
  onEscape,
  lockScroll,
  withInitialFocus = false,
}: {
  open: boolean;
  onEscape?: (() => void) | null;
  lockScroll?: boolean;
  withInitialFocus?: boolean;
}) {
  const initialFocus = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialog<HTMLDivElement>({
    open,
    onEscape: onEscape === undefined ? () => {} : onEscape,
    initialFocus: withInitialFocus ? initialFocus : undefined,
    lockScroll,
  });

  return (
    <>
      <button type="button">opener</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="test" tabIndex={-1}>
          <button type="button">first</button>
          <button type="button" ref={initialFocus}>
            middle
          </button>
          <button type="button">last</button>
        </div>
      )}
    </>
  );
}

describe("useDialog", () => {
  it("moves the focus into the dialog element when it opens", () => {
    const { rerender } = render(<Harness open={false} />);
    screen.getByRole("button", { name: "opener" }).focus();

    rerender(<Harness open />);

    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("prefers `initialFocus` over the dialog element", () => {
    const { rerender } = render(<Harness open={false} withInitialFocus />);
    rerender(<Harness open withInitialFocus />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "middle" }));
  });

  it("returns the focus to whatever opened it", () => {
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    rerender(<Harness open />);
    rerender(<Harness open={false} />);

    expect(document.activeElement).toBe(opener);
  });

  it("calls `onEscape` on Escape, and stops the key there", () => {
    const onEscape = vi.fn();
    render(<Harness open onEscape={onEscape} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("refuses Escape when `onEscape` is null", () => {
    render(<Harness open onEscape={null} />);

    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(<Harness open />);
    screen.getByRole("button", { name: "last" }).focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(<Harness open />);
    screen.getByRole("button", { name: "first" }).focus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
  });

  it("pulls the focus back in when it is outside the dialog", () => {
    render(<Harness open />);
    screen.getByRole("button", { name: "opener" }).focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("does nothing at all while closed", () => {
    const onEscape = vi.fn();
    render(<Harness open={false} onEscape={onEscape} lockScroll />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
  });

  it("freezes and restores the page behind it when `lockScroll` is set", () => {
    const { rerender } = render(<Harness open={false} lockScroll />);
    expect(document.body.style.overflow).toBe("");

    rerender(<Harness open lockScroll />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Harness open={false} lockScroll />);
    expect(document.body.style.overflow).toBe("");
  });

  it("leaves the page scrollable without `lockScroll`", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);

    expect(document.body.style.overflow).toBe("");
  });
});
