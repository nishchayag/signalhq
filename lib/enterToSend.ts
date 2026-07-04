import type { KeyboardEvent } from "react";

// Enter submits the surrounding form; Shift+Enter inserts a newline.
// Skipped while an IME composition is active (confirming a character in
// Japanese/Chinese/Korean input must not send) and on coarse pointers,
// where soft keyboards have no Shift key to fall back on for newlines.
export function enterToSend(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (!isSendKey(e)) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

// Same behavior for composers that send via a click handler instead of a form.
export function enterToSendWith(send: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSendKey(e)) return;
    e.preventDefault();
    send();
  };
}

function isSendKey(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing)
    return false;
  return !window.matchMedia("(pointer: coarse)").matches;
}

export const enterToSendHint = "Enter to send · Shift+Enter for a new line";
