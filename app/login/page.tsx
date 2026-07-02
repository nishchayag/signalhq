"use client";
import { signinSchema } from "@/schemas/signInSchema";
import Link from "next/link";
import React from "react";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import * as z from "zod";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const Page = () => {
  const { register, handleSubmit } = useForm<z.infer<typeof signinSchema>>();
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleSubmitFunction = async (data: z.infer<typeof signinSchema>) => {
    setLoading(true);
    try {
      if (!data.identifier || !data.password) {
        toast.error("All fields are required");
        setLoading(false);
        return;
      }
      const response = await signIn("credentials", {
        identifier: data.identifier,
        password: data.password,
        redirect: false,
      });
      if (!response) {
        toast.error("No response from server");
        return;
      }
      if (response?.error) {
        toast.error(response.error);
        return;
      } else if (response?.ok) {
        toast.success("Login successful");
        // Honor a relative ?callbackUrl (e.g. returning to an invite link).
        const cb = new URLSearchParams(window.location.search).get(
          "callbackUrl"
        );
        const safe = cb && cb.startsWith("/") && !cb.startsWith("//");
        router.push(safe ? cb! : "/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border-2 border-ink bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition";

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4 py-16">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-yellow text-ink">
            <LogIn className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in to your SignalHQ account
          </p>
        </div>

        <form onSubmit={handleSubmit(handleSubmitFunction)} className="space-y-5">
          <div>
            <label
              htmlFor="identifier"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Username or email
            </label>
            <input
              type="text"
              id="identifier"
              {...register("identifier")}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                {...register("password")}
                className={`${inputClass} pr-11`}
                placeholder="Enter your password"
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
            <div className="mt-2 text-right">
              <Link
                href="/forgotPassword"
                className="text-xs font-bold text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Log in
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-bold text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Page;
