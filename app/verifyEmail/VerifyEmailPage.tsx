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
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-semibold text-center mb-4">Verify Email</h1>
      <div className="text-center text-lg mb-6">
        <p>
          <strong>Username:</strong> {username}
        </p>
        <p>
          <strong>Email:</strong> {email}
        </p>
      </div>

      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-6 space-y-4">
        <p className="text-center">
          Enter the 6-digit verification code sent to <strong>{email}</strong>
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col items-center gap-4"
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
                  className="w-12 h-12 text-center text-xl border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading || !isComplete}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}
