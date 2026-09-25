"use client";
import React, { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX, type PublicQuestionConfig } from "@/lib/answers";
import { toggleChoice, type AnswerFormValues } from "@/lib/answerForm";
import { enterToSendWith } from "@/lib/enterToSend";

interface AnswerFieldsProps {
  config: PublicQuestionConfig;
  values: AnswerFormValues;
  onChange: (values: AnswerFormValues) => void;
  disabled?: boolean;
  /** Placeholder for the main text answer (type "text" only). */
  textPlaceholder?: string;
  /** Enter-to-send on any textarea in here — wired to the caller's submit. */
  onEnterSend?: () => void;
}

/**
 * The type-specific input(s) for a question response: a segmented scale for
 * rating/NPS, radio/checkbox "cards" for single/multi, or a plain textarea
 * for a text question — plus, for any typed question, an optional comment
 * box when the question allows one. Native radio/checkbox inputs throughout
 * (no Radix select/radio package), visually hidden with `peer sr-only` and
 * styled via the sibling — this keeps native keyboard/aria behavior for
 * free. Shared by the public response form (QuestionResponseForm) and a
 * member's first private answer to an internal question (QuestionView),
 * so both submit the same shape lib/answerForm.ts#buildAnswerBody expects.
 */
export default function AnswerFields({
  config,
  values,
  onChange,
  disabled,
  textPlaceholder = "Type your anonymous response here...",
  onEnterSend,
}: AnswerFieldsProps) {
  const groupName = useId();
  const onKeyDown = onEnterSend ? enterToSendWith(onEnterSend) : undefined;

  if (config.type === "text") {
    return (
      <Textarea
        value={values.content}
        onChange={(e) => onChange({ ...values, content: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder={textPlaceholder}
        className="min-h-[120px] resize-none"
        disabled={disabled}
        maxLength={1000}
        data-clarity-mask="true"
      />
    );
  }

  return (
    <div className="space-y-4">
      {(config.type === "rating" || config.type === "nps") && config.scale && (
        <fieldset disabled={disabled}>
          <legend className="sr-only">Pick a score</legend>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup">
            {Array.from(
              { length: config.scale.max - config.scale.min + 1 },
              (_, i) => config.scale!.min + i
            ).map((n) => (
              <label key={n} className="relative">
                <input
                  type="radio"
                  name={`${groupName}-score`}
                  value={n}
                  checked={values.score === n}
                  onChange={() => onChange({ ...values, score: n })}
                  className="peer sr-only"
                />
                <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-2 border-ink font-bold text-foreground transition-colors peer-checked:border-ink peer-checked:bg-brand-blue peer-checked:text-on-brand peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                  {n}
                </div>
              </label>
            ))}
          </div>
          {(config.scaleLabels?.min || config.scaleLabels?.max) && (
            <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>{config.scaleLabels?.min}</span>
              <span>{config.scaleLabels?.max}</span>
            </div>
          )}
        </fieldset>
      )}

      {config.type === "single" && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="sr-only">Pick one</legend>
          {(config.options ?? []).map((opt) => (
            <label key={opt.id} className="block cursor-pointer">
              <input
                type="radio"
                name={`${groupName}-choice`}
                value={opt.id}
                checked={(values.choices ?? [])[0] === opt.id}
                onChange={() => onChange({ ...values, choices: [opt.id] })}
                className="peer sr-only"
              />
              <div className="rounded-lg border-2 border-ink px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors peer-checked:bg-brand-mint/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                {opt.label}
              </div>
            </label>
          ))}
        </fieldset>
      )}

      {config.type === "multi" && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            {config.maxSelections ? `Pick up to ${config.maxSelections}` : "Pick any that apply"}
          </legend>
          {(config.options ?? []).map((opt) => {
            const checked = (values.choices ?? []).includes(opt.id);
            const atCap = (values.choices?.length ?? 0) >= (config.maxSelections ?? Infinity);
            return (
              <label key={opt.id} className={checked || !atCap ? "block cursor-pointer" : "block cursor-not-allowed"}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || (!checked && atCap)}
                  onChange={() =>
                    onChange({
                      ...values,
                      choices: toggleChoice(values.choices, opt.id, config.maxSelections ?? Infinity),
                    })
                  }
                  className="peer sr-only"
                />
                <div className="rounded-lg border-2 border-ink px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors peer-checked:bg-brand-mint/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                  {opt.label}
                </div>
              </label>
            );
          })}
        </fieldset>
      )}

      {config.allowComment && (
        <Textarea
          value={values.content}
          onChange={(e) => onChange({ ...values, content: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder="Add an optional comment..."
          className="min-h-[80px] resize-none"
          disabled={disabled}
          maxLength={COMMENT_MAX}
          data-clarity-mask="true"
        />
      )}
    </div>
  );
}
