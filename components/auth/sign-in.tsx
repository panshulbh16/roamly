"use client";
import { useState } from "react";
import {
  Mail,
  ShieldCheck,
  ArrowRight,
  LogOut,
  LoaderCircle,
} from "lucide-react";
import type { AppUser } from "@/lib/auth/server";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { safeReturnTo } from "@/lib/auth/policy";
export function SignIn({
  enabled,
  user,
  returnTo,
  callbackError,
}: {
  enabled: boolean;
  user: AppUser | null;
  returnTo: string;
  callbackError: boolean;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    callbackError
      ? "Sign-in did not complete. Please try again in the browser where you started."
      : "",
  );
  async function post(path: string, data: unknown) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const value = await r.json();
    if (!r.ok)
      throw Error(
        value.error ?? "Sign-in could not complete. Please try again.",
      );
    return value;
  }
  async function emailAction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (sent) {
        const result = await post("/api/auth/verify", {
          email,
          token: code,
          returnTo,
        });
        window.location.assign(safeReturnTo(result.redirectTo));
      } else {
        await post("/api/auth/email", { email });
        setSent(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { url } = await post("/api/auth/google", { returnTo });
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/logout", {});
      window.location.assign("/auth");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="workspace auth-workspace">
      <section className="panel auth-panel">
        <div className="icon-box">
          <ShieldCheck size={22} />
        </div>
        <span className="eyebrow" style={{ display: "block", marginTop: 20 }}>
          YOUR TRIPS. YOUR ACCOUNT.
        </span>
        <h1>{user ? "Your account" : "Welcome to Roamly"}</h1>
        <p className="subtext">
          Sign in to keep your searches and itineraries together, wherever you
          go.
        </p>
        {user && (
          <div className="signed-in-card">
            <strong>Signed in as {user.displayName}</strong>
            <span>{user.email}</span>
            <span>Connected with {user.provider}</span>
            <div className="trip-actions">
              <a className="secondary-button" href="/history">
                View my history <ArrowRight size={15} />
              </a>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={logout}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="auth-options">
          <h2>{user ? "Other sign-in options" : "Choose how to sign in"}</h2>
          <button
            className="google-button"
            disabled={!enabled || busy}
            onClick={google}
          >
            <span className="google-letter" aria-hidden="true">
              G
            </span>
            Continue with Google
          </button>
          <div className="auth-divider">
            <span>or use your email</span>
          </div>
          <form onSubmit={emailAction}>
            <label className="field" htmlFor="sign-in-email">
              Email address
            </label>
            <div className="input-icon" style={{ marginTop: 8 }}>
              <Mail />
              <input
                id="sign-in-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                disabled={!enabled || busy || sent}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {sent && (
              <div style={{ marginTop: 18 }}>
                <p className="subtext">
                  Enter the verification code sent to your email. It expires
                  shortly.
                </p>
                <label className="field" style={{ margin: "14px 0 8px" }}>
                  Verification code
                </label>
                <InputOTP
                  aria-label="Verification code"
                  maxLength={8}
                  value={code}
                  onChange={setCode}
                  disabled={busy}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 8 }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <button
                  type="button"
                  className="text-button"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    setError("");
                  }}
                >
                  Use another email or request a new code
                </button>
              </div>
            )}
            <button
              className="primary"
              style={{ width: "100%", marginTop: 16 }}
              disabled={!enabled || busy || (sent && code.length < 6)}
            >
              {busy ? (
                <LoaderCircle className="loading-spin" size={17} />
              ) : (
                <Mail size={17} />
              )}{" "}
              {sent ? "Verify & sign in" : "Continue with email"}
            </button>
          </form>
          {!enabled && (
            <div className="small-tip" role="status">
              <strong>Google and email sign-in aren’t connected yet.</strong>
              These options need the site owner’s authentication setup.{" "}
              {user
                ? "Your current account and history still work."
                : "You can use the existing ChatGPT sign-in below."}
            </div>
          )}
          {!user && (
            <form
              method="post"
              action={"/auth/platform?returnTo=" + encodeURIComponent(returnTo)}
              target="_top"
            >
              <button
                className="secondary-button"
                style={{
                  marginTop: 20,
                  width: "100%",
                  justifyContent: "center",
                }}
                type="submit"
              >
                Continue with ChatGPT <ArrowRight size={16} />
              </button>
            </form>
          )}
        </div>
        <p className="form-note">
          Your history belongs to the account you sign in with.
        </p>
      </section>
    </main>
  );
}
