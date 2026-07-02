"use client";
import React, { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import axios from "axios";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
type OtpField = "otp1" | "otp2" | "otp3" | "otp4" | "otp5" | "otp6";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const username = params.get("username");
  const email = params.get("email");
  const callbackUrl = params.get("callbackUrl");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: {
      otp1: "",
      otp2: "",
      otp3: "",
      otp4: "",
      otp5: "",
      otp6: "",
    },
  });

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const otpValues = watch(["otp1", "otp2", "otp3", "otp4", "otp5", "otp6"]);
  const isComplete = otpValues.every((val) => val && val.length === 1);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const value = e.target.value;
    if (!/^\d?$/.test(value)) return;

    const field: OtpField = `otp${index + 1}` as OtpField;
    setValue(field, value);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const field: OtpField = `otp${index + 1}` as OtpField;
    if (e.key === "Backspace" && !getValues(field) && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onSubmit = async (data: Record<OtpField, string>) => {
    setLoading(true);
    try {
      const otpCode = Object.values(data).join("");
      const response = await axios.post("/api/auth/verifyEmail", {
        email,
        username,
        otpCode,
      });
      if (response.data.error) {
        toast.error(response.data.error);
      }
      if (response.data.message) {
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
      }
    } catch (error: unknown) {
      console.error("Error verifying email:", error);
      toast("Error verifying email: " + (error as Error).message);
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
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 flex flex-col items-center gap-6"
        >
          <div className="flex justify-center gap-2">
            {[...Array(6)].map((_, index) => {
              const field: OtpField = `otp${index + 1}` as OtpField;
              return (
                <input
                  key={index}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete="one-time-code"
                  {...register(field, { required: true })}
                  onChange={(e) => handleChange(e, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  className="h-12 w-11 rounded-lg border-2 border-ink bg-card text-center text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-12"
                />
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading || !isComplete}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Signed up as{" "}
          <span className="font-semibold text-foreground">{username}</span>
        </p>
      </div>
    </div>
  );
}
