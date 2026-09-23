"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import axios from "axios";
import { KeyRound, Loader2 } from "lucide-react";

type FormData = { email: string };

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm<FormData>();

  const inputClass =
    "w-full rounded-lg border-2 border-ink bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition";

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/forgotPassword", data);
      toast.success(response.data.message);
      router.push(`/resetPassword?email=${encodeURIComponent(data.email)}`);
    } catch (error) {
      console.error("Error requesting password reset:", error);
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
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-yellow text-on-brand">
            <KeyRound className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Forgot your password?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset code.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              {...register("email", { required: true })}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send reset code"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
