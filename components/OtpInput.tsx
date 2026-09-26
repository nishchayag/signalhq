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

  // Splits a pasted/autofilled string (which may contain spaces, dashes or
  // newlines — codes copied from an email body often do) into the boxes.
  // A full-length code always starts at box 0, since that's what the user
  // means regardless of which box happened to receive the paste/autofill.
  const distributeDigits = (raw: string, index: number) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;

    const startAt = digits.length >= length ? 0 : index;
    const chunk = digits.slice(0, length - startAt);
    if (!chunk) return;

    const next = [...value];
    for (let i = 0; i < chunk.length; i++) {
      next[startAt + i] = chunk[i];
    }
    onChange(next);

    const lastFilled = startAt + chunk.length - 1;
    const nextEmpty = next.findIndex(
      (v, i) => i > lastFilled && !v
    );
    const focusIndex =
      nextEmpty !== -1 ? nextEmpty : Math.min(lastFilled, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const raw = e.target.value;

    // Autofill (iOS/Android SMS or email one-time-code suggestions, some
    // password managers) can set the whole code on a single box via a
    // programmatic value change that bypasses maxLength and onPaste.
    if (raw.length > 1) {
      distributeDigits(raw, index);
      return;
    }

    if (!/^\d?$/.test(raw)) return;

    const next = [...value];
    next[index] = raw;
    onChange(next);

    if (raw && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    distributeDigits(text, index);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
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
          onPaste={(e) => handlePaste(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onFocus={(e) => e.target.select()}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          className="h-12 w-11 rounded-lg border-2 border-ink bg-card text-center text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-12"
        />
      ))}
    </div>
  );
}
