"use client";
import React, { useRef } from "react";

interface OtpInputProps {
  length?: number;
  value: string[];
  onChange: (values: string[]) => void;
}

// Shared 6-box OTP entry (digit boxes with auto-advance/backspace nav), used
// by both the signup-verification and password-reset flows.
export default function OtpInput({
  length = 6,
  value,
  onChange,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const val = e.target.value;
    if (!/^\d?$/.test(val)) return;

    const next = [...value];
    next[index] = val;
    onChange(next);

    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          value={value[index] || ""}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          className="h-12 w-11 rounded-lg border-2 border-ink bg-card text-center text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-12"
        />
      ))}
    </div>
  );
}
