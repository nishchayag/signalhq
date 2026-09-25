"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createQuestionSchema,
  updateQuestionSchema,
  questionConfigIssues,
  CreateQuestionRequest,
} from "@/schemas/questionSchema";
import {
  MAX_RESPONSES_LIMIT,
  OPTIONS_MAX,
  OPTIONS_MIN,
  OPTION_LABEL_MAX,
  QUESTION_TYPES,
  SCALES,
  questionType,
  type QuestionType,
} from "@/lib/answers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";
import { apiError } from "@/lib/apiError";
import { useConfirm } from "@/components/ConfirmProvider";
import AiQuotaNote, { quotaExhausted } from "@/components/AiQuotaNote";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/datetimeLocal";

interface CreateQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionCreated?: (question: IQuestion) => void;
  /** Edit mode: prefill from this question. Visibility and team are fixed
   *  once a question exists; type/options lock once it has responses. */
  question?: IQuestion | null;
  onQuestionUpdated?: (question: IQuestion) => void;
  /** AI status for the active org — null/undefined while loading, in which
   *  case the AI block stays hidden rather than flashing in. */
  ai?: AiStatus | null;
  /** Re-fetch AI status (usage counters) after a suggest attempt. */
  refreshAi?: () => void;
}

interface Team {
  _id: string;
  name: string;
  isMember: boolean;
}

interface Suggestion {
  questionText: string;
  description: string;
}

const SELECT_CLASS =
  "flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  rating: "Rating (1–5)",
  nps: "NPS (0–10)",
  single: "Single choice",
  multi: "Multiple choice",
};

const defaultFormValues = (): CreateQuestionRequest => ({
  questionText: "",
  description: "",
  visibility: "public",
  type: "text",
  config: { allowComment: true },
  closesAt: null,
  maxResponses: null,
});

export default function CreateQuestionDialog({
  open,
  onOpenChange,
  onQuestionCreated,
  question,
  onQuestionUpdated,
  ai,
  refreshAi,
}: CreateQuestionDialogProps) {
  const isEdit = Boolean(question);
  // Type and option add/remove lock once the question has responses — a
  // fast client-side check; the server independently re-checks (it also
  // probes for legacy Messages whose count drifted) and returns 409
  // QUESTION_LOCKED, surfaced below via lockError.
  const locked = isEdit && (question?.responseCount ?? 0) > 0;
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hint, setHint] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    getValues,
    control,
  } = useForm<CreateQuestionRequest>({
    // Edit mode uses the looser update schema — the create schema rejects a
    // past closesAt, which would block editing a question whose close date
    // has already passed. Cross-field config rules (min options, unique
    // labels, maxSelections vs. option count) are re-checked manually below
    // via questionConfigIssues so both modes get the same live feedback.
    resolver: zodResolver(
      (isEdit ? updateQuestionSchema : createQuestionSchema) as typeof createQuestionSchema
    ),
    defaultValues: defaultFormValues(),
  });

  // Custom keyName: our option items have their own `id` (the server's
  // option identifier, echoed back to keep it across edits) — react-hook-form
  // would otherwise silently clobber that field with its own generated
  // per-row key under the same "id" name.
  const optionsArray = useFieldArray({ control, name: "config.options", keyName: "fieldKey" });
  const type = useWatch({ control, name: "type" }) ?? "text";
  const config = useWatch({ control, name: "config" });
  const closesAtValue = useWatch({ control, name: "closesAt" });
  const maxResponsesValue = useWatch({ control, name: "maxResponses" });
  const configIssues = questionConfigIssues(type, config);

  // AI is available for this dialog only once the org has enabled it and
  // this role is allowed to use question:create's AI counterpart.
  const showAi = Boolean(ai?.enabled && ai?.can.suggest);
  const suggestUsage = ai?.usage?.suggest;

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const teamId = isEdit
        ? question?.teamId
          ? String(question.teamId)
          : undefined
        : getValues("teamId");
      const response = await axios.post("/api/suggestMessages", {
        teamId: teamId || undefined,
        hint: hint.trim() || undefined,
      });
      setSuggestions(response.data.suggestions);
    } catch (error) {
      toast.error(apiError(error, "Failed to generate suggestions"));
    } finally {
      setSuggesting(false);
      refreshAi?.();
    }
  };

  const applySuggestion = async (suggestion: Suggestion) => {
    const currentDescription = getValues("description");
    if (currentDescription && currentDescription.trim()) {
      const ok = await confirm({
        title: "Replace your description?",
        description: "The suggestion's description will overwrite what you've already written.",
        confirmLabel: "Replace",
      });
      if (!ok) {
        setValue("questionText", suggestion.questionText, { shouldValidate: true });
        setSuggestions([]);
        return;
      }
    }
    setValue("questionText", suggestion.questionText, { shouldValidate: true });
    setValue("description", suggestion.description, { shouldValidate: true });
    setSuggestions([]);
  };

  // Switching into a choice type seeds enough options to be valid
  // immediately; switching away leaves them in place (in case of a flip
  // back) since the server only ever reads the ones that apply to `type`.
  const handleTypeChange = (next: QuestionType) => {
    setValue("type", next, { shouldDirty: true, shouldValidate: true });
    if (next === "single" || next === "multi") {
      const current = getValues("config.options") ?? [];
      for (let i = current.length; i < OPTIONS_MIN; i++) {
        optionsArray.append({ label: "" });
      }
    }
  };

  // Edit mode: load the question's current fields into the form each time
  // the dialog opens; create mode: reset to a clean form (options etc. from
  // a previous create attempt shouldn't linger).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLockError(null);
    if (question) {
      reset({
        questionText: question.questionText,
        description: question.description ?? "",
        visibility: question.visibility,
        type: questionType(question),
        config: {
          allowComment: question.config?.allowComment ?? true,
          ...(question.config?.options && {
            options: question.config.options.map((o) => ({ id: o.id, label: o.label })),
          }),
          ...(question.config?.scaleLabels && { scaleLabels: question.config.scaleLabels }),
          ...(question.config?.maxSelections && { maxSelections: question.config.maxSelections }),
        },
        closesAt: question.closesAt ? new Date(question.closesAt).toISOString() : null,
        maxResponses: question.maxResponses ?? null,
      });
    } else {
      reset(defaultFormValues());
    }
  }, [open, question, reset]);

  // Load the active org's teams when the dialog opens so the question can be
  // scoped to one. Members only see teams they belong to (they can't create
  // questions for teams they aren't part of, and wouldn't see them afterwards).
  useEffect(() => {
    if (!open || isEdit) return; // team is fixed after creation
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    (async () => {
      try {
        const res = await axios.get(`/api/organizations/${orgId}/teams`);
        if (res.data.success) {
          const all: Team[] = res.data.teams;
          const isMemberRole = session?.user?.activeOrgRole === "MEMBER";
          setTeams(isMemberRole ? all.filter((t) => t.isMember) : all);
        }
      } catch (error) {
        console.error("Error loading teams:", error);
      }
    })();
  }, [open, session, isEdit]);

  const onSubmit = async (data: CreateQuestionRequest) => {
    const nextType = data.type ?? "text";
    const issues = questionConfigIssues(nextType, data.config);
    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }
    setLoading(true);
    setLockError(null);
    try {
      if (question) {
        const response = await axios.put(`/api/questions/${question._id}`, {
          questionText: data.questionText,
          description: data.description ?? "",
          type: data.type,
          config: data.config,
          closesAt: data.closesAt,
          maxResponses: data.maxResponses,
        });
        onQuestionUpdated?.(response.data.question);
        toast.success("Question updated");
        onOpenChange(false);
        return;
      }
      const response = await axios.post("/api/questions", data);
      if (response.data.success) {
        onQuestionCreated?.(response.data.question);
        reset(defaultFormValues());
        onOpenChange(false);
      } else {
        toast.error(response.data.message || "Failed to create question");
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.code === "QUESTION_LOCKED") {
        setLockError(
          error.response.data.message ||
            "This question already has responses, so its type and options can't change."
        );
        return;
      }
      console.error("Error saving question:", error);
      toast.error(apiError(error, isEdit ? "Failed to update question" : "Failed to create question"));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset(defaultFormValues());
      setSuggestions([]);
      setHint("");
      setLockError(null);
      onOpenChange(false);
    }
  };

  const isChoiceType = type === "single" || type === "multi";
  const isScaleType = type === "rating" || type === "nps";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit question" : "Create New Question"}</DialogTitle>
        </DialogHeader>

        {isEdit && (question?.responseCount ?? 0) > 0 && (
          <p className="rounded-lg border-2 border-ink bg-brand-yellow/30 px-3 py-2 text-sm font-medium text-foreground">
            This question already has {question!.responseCount} response
            {question!.responseCount === 1 ? "" : "s"}. They were written to the original wording;
            edits only change what new responders see.
          </p>
        )}

        {lockError && (
          <p
            role="alert"
            className="rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {lockError}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="questionText">Question *</Label>
              {showAi && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="Focus (optional)"
                    maxLength={200}
                    disabled={loading || suggesting}
                    aria-label="Suggestion focus hint"
                    className="h-8 w-32 rounded-lg border-2 border-ink bg-card px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-40"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSuggest}
                    disabled={loading || suggesting || quotaExhausted(suggestUsage)}
                  >
                    {suggesting ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-3 w-3" />
                    )}
                    Suggest
                  </Button>
                </div>
              )}
            </div>
            <Textarea
              id="questionText"
              {...register("questionText")}
              placeholder="What would you like to ask your audience?"
              className="min-h-[80px] resize-none"
              disabled={loading}
            />
            {errors.questionText && (
              <p className="text-sm text-destructive">
                {errors.questionText.message}
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid="ai-suggestion-card"
                    onClick={() => applySuggestion(suggestion)}
                    className="pop block w-full rounded-lg border-2 border-ink bg-brand-yellow/20 px-3 py-2 text-left"
                  >
                    <p className="text-sm font-bold text-foreground">{suggestion.questionText}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                  </button>
                ))}
              </div>
            )}
            {showAi && <AiQuotaNote usage={suggestUsage} resetsAt={ai?.resetsAt} />}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Add context or instructions for your question..."
              className="min-h-[60px] resize-none"
              disabled={loading}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Response type</Label>
            <select
              id="type"
              value={type}
              disabled={loading || locked}
              onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
              className={SELECT_CLASS}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {locked && (
              <p className="text-xs text-muted-foreground">
                This question already has responses, so its type can&apos;t change.
              </p>
            )}
          </div>

          {isChoiceType && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="space-y-2">
                {optionsArray.fields.map((field, index) => (
                  <div key={field.fieldKey}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          aria-label="Move option up"
                          disabled={index === 0}
                          onClick={() => optionsArray.move(index, index - 1)}
                          className="rounded border-2 border-ink p-0.5 disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move option down"
                          disabled={index === optionsArray.fields.length - 1}
                          onClick={() => optionsArray.move(index, index + 1)}
                          className="rounded border-2 border-ink p-0.5 disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Input
                        {...register(`config.options.${index}.label` as const)}
                        placeholder={`Option ${index + 1}`}
                        maxLength={OPTION_LABEL_MAX}
                        disabled={loading}
                        aria-label={`Option ${index + 1} label`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove option"
                        disabled={loading || locked || optionsArray.fields.length <= OPTIONS_MIN}
                        onClick={() => optionsArray.remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {errors.config?.options?.[index]?.label && (
                      <p className="ml-8 mt-1 text-sm text-destructive">
                        {errors.config.options[index]?.label?.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {configIssues.length > 0 && (
                <ul className="space-y-0.5">
                  {configIssues.map((issue, i) => (
                    <li key={i} className="text-sm text-destructive">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || locked || optionsArray.fields.length >= OPTIONS_MAX}
                onClick={() => optionsArray.append({ label: "" })}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add option
              </Button>

              {type === "multi" && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="maxSelections">Max selections (optional)</Label>
                  <Input
                    id="maxSelections"
                    type="number"
                    min={1}
                    max={optionsArray.fields.length}
                    disabled={loading}
                    {...register("config.maxSelections", {
                      setValueAs: (v) => (v === "" || v === undefined ? undefined : Number(v)),
                    })}
                  />
                  {errors.config?.maxSelections && (
                    <p className="text-sm text-destructive">{errors.config.maxSelections.message}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {isScaleType && (
            <div className="space-y-2">
              <Label>Scale end labels (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Responders pick a whole number from {SCALES[type].min} to {SCALES[type].max}.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  {...register("config.scaleLabels.min")}
                  placeholder={`Caption for ${SCALES[type].min}`}
                  disabled={loading}
                  aria-label="Low-end scale label"
                />
                <Input
                  {...register("config.scaleLabels.max")}
                  placeholder={`Caption for ${SCALES[type].max}`}
                  disabled={loading}
                  aria-label="High-end scale label"
                />
              </div>
            </div>
          )}

          {type !== "text" && (
            <div className="flex items-center justify-between rounded-lg border-2 border-ink bg-card px-3.5 py-2.5">
              <div>
                <Label htmlFor="allowComment" className="text-sm font-semibold">
                  Allow an optional comment
                </Label>
                <p className="text-xs text-muted-foreground">
                  Responders can add a short note alongside their answer.
                </p>
              </div>
              <Switch
                id="allowComment"
                checked={config?.allowComment !== false}
                onCheckedChange={(checked) =>
                  setValue("config.allowComment", checked, { shouldDirty: true })
                }
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="closesAt">Close date (optional)</Label>
              {closesAtValue && (
                <button
                  type="button"
                  onClick={() => setValue("closesAt", null, { shouldDirty: true, shouldValidate: true })}
                  className="text-xs font-semibold text-muted-foreground underline"
                >
                  Clear
                </button>
              )}
            </div>
            <Input
              id="closesAt"
              type="datetime-local"
              value={toDatetimeLocalValue(closesAtValue)}
              onChange={(e) =>
                setValue("closesAt", e.target.value ? fromDatetimeLocalValue(e.target.value) : null, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={loading}
            />
            {errors.closesAt && (
              <p className="text-sm text-destructive">{errors.closesAt.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxResponses">Response cap (optional)</Label>
              {maxResponsesValue != null && (
                <button
                  type="button"
                  onClick={() => setValue("maxResponses", null, { shouldDirty: true, shouldValidate: true })}
                  className="text-xs font-semibold text-muted-foreground underline"
                >
                  Clear
                </button>
              )}
            </div>
            <Input
              id="maxResponses"
              type="number"
              min={1}
              max={MAX_RESPONSES_LIMIT}
              disabled={loading}
              {...register("maxResponses", {
                setValueAs: (v) => (v === "" || v === undefined ? null : Number(v)),
              })}
            />
            {errors.maxResponses && (
              <p className="text-sm text-destructive">{errors.maxResponses.message}</p>
            )}
          </div>

          {isEdit ? (
            <p className="text-xs text-muted-foreground">
              Who can answer and the team can&apos;t be changed after a question is created.
            </p>
          ) : (
          <div className="space-y-2">
            <Label htmlFor="visibility">Who can answer</Label>
            <select
              id="visibility"
              {...register("visibility")}
              disabled={loading}
              className={SELECT_CLASS}
            >
              <option value="public">Public — anyone with the link can respond</option>
              <option value="internal">
                Internal — only your team can privately answer
              </option>
            </select>
          </div>
          )}

          {!isEdit && teams.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="teamId">Team (Optional)</Label>
              <select
                id="teamId"
                {...register("teamId")}
                disabled={loading}
                className={SELECT_CLASS}
              >
                <option value="">Organization-wide (no team)</option>
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || configIssues.length > 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create Question"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
