"use client";
import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import OtpInput from "@/components/OtpInput";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const username = params.get("username");
  const email = params.get("email");
  const callbackUrl = params.get("callbackUrl");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const isComplete = otp.every((val) => val.length === 1);

  const handleResend = async () => {
    setResending(true);
    try {
      const response = await axios.post("/api/auth/resendOtp", {
        email,
        username,
      });
      toast.success(response.data.message || "A new code has been sent");
      setOtp(Array(6).fill(""));
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error
        : null;
      toast.error(msg || "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const otpCode = otp.join("");
      const response = await axios.post("/api/auth/verifyEmail", {
        email,
        username,
        otpCode,
      });
      toast.success(response.data.message);

      // Preserve a relative callbackUrl so the post-login redirect can return
      // the user to where they started (e.g. an invite link).
      const safe =
        callbackUrl &&
        callbackUrl.startsWith("/") &&
        !callbackUrl.startsWith("//");
      router.push(
        safe
          ? `/login?callbackUrl=${encodeURIComponent(callbackUrl!)}`
          : "/login"
      );
    } catch (error: unknown) {
      console.error("Error verifying email:", error);
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error
        : null;
      toast.error(msg || "Error verifying email, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4 py-16">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg text-center">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-blue text-ink">
          <span className="text-lg font-black">#</span>
        </span>
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Verify your email
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-foreground">{email}</span>
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 flex flex-col items-center gap-6"
        >
          <OtpInput value={otp} onChange={setOtp} />

          <button
            type="submit"
            disabled={loading || !isComplete}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>
        </form>

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
          Signed up as{" "}
          <span className="font-semibold text-foreground">{username}</span>
        </p>
      </div>
    </div>
  );
}
