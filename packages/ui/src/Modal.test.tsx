// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmModal, Modal } from "./Modal";

afterEach(cleanup);

const noop = () => {};

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(
      <Modal isOpen={false} onClose={noop}>
        Body
      </Modal>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible dialog with title and description", () => {
    render(
      <Modal isOpen onClose={noop} title="Delete request" description="Undone?">
        Body
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("modal-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("modal-description");
    expect(
      screen.getByRole("heading", { name: "Delete request" })
    ).toBeTruthy();
  });

  it("leaves the label off the dialog when there is no title", () => {
    render(
      <Modal isOpen onClose={noop}>
        Body
      </Modal>
    );

    expect(
      screen.getByRole("dialog").getAttribute("aria-labelledby")
    ).toBeNull();
  });

  it("closes on the close button, Escape and an overlay click", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Title">
        Body
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("ignores a click inside the panel", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Title">
        Body
      </Modal>
    );

    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours closeOnEscape / closeOnOverlayClick / showCloseButton", () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen
        onClose={onClose}
        title="Title"
        closeOnEscape={false}
        closeOnOverlayClick={false}
        showCloseButton={false}
      >
        Body
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull();
  });

  it("locks body scrolling while open and restores it on unmount", () => {
    const { unmount } = render(
      <Modal isOpen onClose={noop}>
        Body
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("unset");
  });
});

describe("ConfirmModal", () => {
  it("confirms and cancels through the given handlers", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Delete this item?"
        confirmText="Delete"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and labels the pending action while loading", () => {
    render(
      <ConfirmModal
        isOpen
        onClose={noop}
        onConfirm={noop}
        message="Delete this item?"
        loading
      />
    );

    const cancel = screen.getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement | null;
    const confirm = screen.getByRole("button", {
      name: "Processing...",
    }) as HTMLButtonElement | null;

    expect(cancel?.disabled).toBe(true);
    expect(confirm?.disabled).toBe(true);
  });
});
