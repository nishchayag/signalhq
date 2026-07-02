"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import OtpInput from "@/components/OtpInput";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const router = useRouter();

  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isComplete = otp.every((val) => val.length === 1);
  const inputClass =
    "w-full rounded-lg border-2 border-ink bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/resetPassword", {
        email,
        otpCode: otp.join(""),
        newPassword,
      });
      toast.success(response.data.message);
      router.push("/login");
    } catch (error) {
      console.error("Error resetting password:", error);
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      toast.error(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4 py-16">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg text-center">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-blue text-ink">
          <KeyRound className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-foreground">{email}</span>
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
          <OtpInput value={otp} onChange={setOtp} />

          <div className="text-left">
            <label
              htmlFor="newPassword"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                placeholder="Enter a new password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="text-left">
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Confirm new password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder="Re-enter your new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !isComplete || !newPassword || !confirmPassword}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset password"
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Didn&apos;t get a code?{" "}
          <Link href="/forgotPassword" className="font-bold text-primary hover:underline">
            Request a new one
          </Link>
        </p>
      </div>
    </div>
  );
}
