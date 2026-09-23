"use client";
import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import OtpInput from "@/components/OtpInput";
import { apiError } from "@/lib/apiError";

/** The API looks accounts up by email or username; tell them apart by "@". */
function toIdentifierBody(identifier: string): { email?: string; username?: string } {
  const value = identifier.trim();
  return value.includes("@") ? { email: value } : { username: value };
}

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");
  // Signup passes ?username=&email=; the login page's "Verify your email"
  // passes a single ?identifier= (whatever the user typed there).
  const initialEmail = params.get("email");
  const initialIdentifier = params.get("identifier") || initialEmail || params.get("username") || "";
  const router = useRouter();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const isComplete = otp.every((val) => val.length === 1);
  const hasIdentifier = identifier.trim().length > 0;
  const shownEmail = initialEmail || (identifier.includes("@") ? identifier.trim() : null);

  const handleResend = async () => {
    if (!hasIdentifier) {
      toast.error("Enter your email or username first");
      return;
    }
    setResending(true);
    try {
      const response = await axios.post("/api/auth/resendOtp", toIdentifierBody(identifier));
      toast.success(response.data.message || "A new code has been sent");
      setOtp(Array(6).fill(""));
    } catch (error) {
      toast.error(apiError(error, "Failed to resend code"));
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasIdentifier) return;
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/verifyEmail", {
        ...toIdentifierBody(identifier),
        otpCode: otp.join(""),
      });
      toast.success(response.data.message);

      // Preserve a relative callbackUrl so the post-login redirect can return
      // the user to where they started (e.g. an invite link).
      const safe = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//");
      router.push(safe ? `/login?callbackUrl=${encodeURIComponent(callbackUrl!)}` : "/login");
    } catch (error: unknown) {
      console.error("Error verifying email:", error);
      toast.error(apiError(error, "Error verifying email, please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4 py-16">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg text-center">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-blue text-on-brand">
          <span className="text-lg font-black">#</span>
        </span>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {shownEmail ? (
            <>
              Enter the 6-digit code sent to{" "}
              <span className="font-semibold text-foreground">{shownEmail}</span>
            </>
          ) : initialIdentifier ? (
            "Enter the 6-digit code we emailed you, or send a new one below."
          ) : (
            "Enter the email or username you signed up with, then send yourself a code."
          )}
        </p>

        {/* Only when we don't already know who's verifying (e.g. /verifyEmail
            opened directly) — otherwise the page used to be a dead end. */}
        {!initialIdentifier && (
          <div className="mt-6 text-left">
            <label htmlFor="identifier" className="text-sm font-bold text-foreground">
              Email or username
            </label>
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="mt-1.5 w-full rounded-lg border-2 border-ink bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || !hasIdentifier}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg border-2 border-ink bg-card py-2.5 text-sm font-bold text-foreground pop disabled:opacity-50"
            >
              {resending ? "Sending..." : "Send me a code"}
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 flex flex-col items-center gap-6">
          <OtpInput value={otp} onChange={setOtp} />

          <button
            type="submit"
            disabled={loading || !isComplete || !hasIdentifier}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>
        </form>

        {initialIdentifier && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Didn&apos;t get a code?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="font-bold text-primary hover:underline disabled:opacity-50"
              >
                {resending ? "Sending..." : "Resend code"}
              </button>
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Verifying <span className="font-semibold text-foreground">{initialIdentifier}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
