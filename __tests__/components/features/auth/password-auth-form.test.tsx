import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flow = vi.hoisted(() => ({
  signUpWithPassword: vi.fn(),
  signInWithPassword: vi.fn(),
  directPasswordReset: vi.fn(),
  loadSignupDomainAllowlist: vi.fn(),
}));

vi.mock("#/lib/data-platform/auth-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/lib/data-platform/auth-flow")>()),
  signUpWithPassword: flow.signUpWithPassword,
  signInWithPassword: flow.signInWithPassword,
  directPasswordReset: flow.directPasswordReset,
  loadSignupDomainAllowlist: flow.loadSignupDomainAllowlist,
}));

const { PasswordAuthForm } =
  await import("#/components/features/auth/password-auth-form");

/** A promise the test resolves by hand, to hold a submit "in flight". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function fillCredentials(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("auth-email"), email);
  await user.type(screen.getByTestId("auth-password"), password);
  return user;
}

describe("PasswordAuthForm", () => {
  beforeEach(() => {
    flow.signUpWithPassword.mockReset();
    flow.signInWithPassword.mockReset();
    flow.directPasswordReset.mockReset();
    flow.loadSignupDomainAllowlist.mockReset().mockResolvedValue([]);
  });

  it("shows the translated invalid-credentials copy, not the raw API message", async () => {
    flow.signInWithPassword.mockResolvedValue({ kind: "invalid_credentials" });
    render(<PasswordAuthForm />);

    const user = await fillCredentials("me@neodevex.com", "wrong-pass");
    await user.click(screen.getByTestId("auth-submit"));

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "NEODEVEX_AUTH$INVALID_CREDENTIALS",
    );
  });

  it("rejects a non-allowlisted email locally without calling the auth API", async () => {
    flow.loadSignupDomainAllowlist.mockResolvedValue(["neodevex.com"]);
    render(<PasswordAuthForm />);
    await screen.findByText("neodevex.com");

    const user = await fillCredentials("me@elsewhere.test", "hunter22");
    await user.click(screen.getByTestId("auth-submit"));

    expect(await screen.findByTestId("auth-email-error")).toHaveTextContent(
      "NEODEVEX_AUTH$DOMAIN_REJECTED",
    );
    expect(flow.signInWithPassword).not.toHaveBeenCalled();
  });

  it("validates password length and confirmation before creating an account", async () => {
    render(<PasswordAuthForm />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("auth-mode-toggle"));

    await user.type(screen.getByTestId("auth-email"), "me@neodevex.com");
    await user.type(screen.getByTestId("auth-password"), "short");
    await user.type(screen.getByTestId("auth-confirm-password"), "short");
    await user.click(screen.getByTestId("auth-submit"));
    expect(screen.getByTestId("auth-confirm-password-error")).toHaveTextContent(
      "NEODEVEX_AUTH$PASSWORD_TOO_SHORT",
    );

    await user.type(screen.getByTestId("auth-password"), "-enough");
    await user.click(screen.getByTestId("auth-submit"));
    expect(screen.getByTestId("auth-confirm-password-error")).toHaveTextContent(
      "NEODEVEX_AUTH$PASSWORD_MISMATCH",
    );
    expect(flow.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("offers a switch to sign-in when the account already exists", async () => {
    flow.signUpWithPassword.mockResolvedValue({ kind: "already_exists" });
    render(<PasswordAuthForm />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("auth-mode-toggle"));
    await user.type(screen.getByTestId("auth-email"), "me@neodevex.com");
    await user.type(screen.getByTestId("auth-password"), "hunter22!");
    await user.type(screen.getByTestId("auth-confirm-password"), "hunter22!");
    await user.click(screen.getByTestId("auth-submit"));

    const banner = await screen.findByTestId("auth-already-exists");
    await user.click(
      screen.getByRole("button", { name: "NEODEVEX_AUTH$SIGN_IN_INSTEAD" }),
    );
    expect(banner).not.toBeInTheDocument();
    expect(screen.getByText("NEODEVEX_AUTH$SIGN_IN_TITLE")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-confirm-password")).toBeNull();
  });

  it("locks the mode switches while a request is in flight", async () => {
    const pending = deferred<{ kind: "already_exists" }>();
    flow.signUpWithPassword.mockReturnValue(pending.promise);
    render(<PasswordAuthForm />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("auth-mode-toggle"));
    await user.type(screen.getByTestId("auth-email"), "me@neodevex.com");
    await user.type(screen.getByTestId("auth-password"), "hunter22!");
    await user.type(screen.getByTestId("auth-confirm-password"), "hunter22!");
    await user.click(screen.getByTestId("auth-submit"));

    expect(screen.getByTestId("auth-mode-toggle")).toBeDisabled();
    expect(screen.getByTestId("auth-submit")).toBeDisabled();

    pending.resolve({ kind: "already_exists" });
    await screen.findByTestId("auth-already-exists");
    expect(screen.getByTestId("auth-mode-toggle")).toBeEnabled();
    // Still on the sign-up form -- the outcome landed on the mode it belongs to.
    expect(screen.getByTestId("auth-confirm-password")).toBeInTheDocument();
  });

  it("signs the user straight in after a direct password reset", async () => {
    flow.directPasswordReset.mockResolvedValue({ kind: "changed" });
    flow.signInWithPassword.mockResolvedValue({ kind: "signed_in" });
    render(<PasswordAuthForm />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("auth-forgot-link"));
    expect(screen.getByText("NEODEVEX_AUTH$FORGOT_TITLE")).toBeInTheDocument();

    await user.type(screen.getByTestId("auth-email"), "me@neodevex.com");
    await user.type(screen.getByTestId("auth-password"), "new-pass-1");
    await user.type(screen.getByTestId("auth-confirm-password"), "new-pass-1");
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() =>
      expect(flow.signInWithPassword).toHaveBeenCalledWith(
        "me@neodevex.com",
        "new-pass-1",
      ),
    );
    expect(flow.directPasswordReset).toHaveBeenCalledWith(
      "me@neodevex.com",
      "new-pass-1",
    );
    expect(screen.queryByTestId("auth-error")).toBeNull();
  });

  it("falls back to the generic copy when the reset fails without a message", async () => {
    flow.directPasswordReset.mockResolvedValue({ kind: "error" });
    render(<PasswordAuthForm />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("auth-forgot-link"));
    await user.type(screen.getByTestId("auth-email"), "me@neodevex.com");
    await user.type(screen.getByTestId("auth-password"), "new-pass-1");
    await user.type(screen.getByTestId("auth-confirm-password"), "new-pass-1");
    await user.click(screen.getByTestId("auth-submit"));

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "NEODEVEX_AUTH$GENERIC_ERROR",
    );
    expect(flow.signInWithPassword).not.toHaveBeenCalled();
  });
});
