"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createQuestionSchema,
  CreateQuestionRequest,
} from "@/schemas/questionSchema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";
import { apiError } from "@/lib/apiError";

interface CreateQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionCreated?: (question: IQuestion) => void;
  /** Edit mode: prefill from this question and PUT only text/description
   *  (visibility and team are fixed once a question exists). */
  question?: IQuestion | null;
  onQuestionUpdated?: (question: IQuestion) => void;
}

interface Team {
  _id: string;
  name: string;
  isMember: boolean;
}

export default function CreateQuestionDialog({
  open,
  onOpenChange,
  onQuestionCreated,
  question,
  onQuestionUpdated,
}: CreateQuestionDialogProps) {
  const isEdit = Boolean(question);
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<CreateQuestionRequest>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: { visibility: "public" },
  });

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const response = await axios.post("/api/suggestMessages");
      const completion: string = response.data.completion;
      setSuggestions(
        completion
          .split("||")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } catch (error) {
      toast.error(apiError(error, "Failed to generate suggestions"));
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    setValue("questionText", suggestion, { shouldValidate: true });
    setSuggestions([]);
  };

  // Edit mode: load the question's current text into the form each time the
  // dialog opens (the create schema's text/description rules are the same
  // ones updateQuestionSchema enforces, so one resolver covers both).
  useEffect(() => {
    if (open && question) {
      reset({
        questionText: question.questionText,
        description: question.description ?? "",
        visibility: question.visibility,
      });
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
    setLoading(true);
    try {
      if (question) {
        const response = await axios.put(`/api/questions/${question._id}`, {
          questionText: data.questionText,
          description: data.description ?? "",
        });
        onQuestionUpdated?.(response.data.question);
        toast.success("Question updated");
        onOpenChange(false);
        return;
      }
      const response = await axios.post("/api/questions", data);
      if (response.data.success) {
        onQuestionCreated?.(response.data.question);
        reset();
        onOpenChange(false);
      } else {
        toast.error(response.data.message || "Failed to create question");
      }
    } catch (error) {
      console.error("Error saving question:", error);
      toast.error(apiError(error, isEdit ? "Failed to update question" : "Failed to create question"));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      setSuggestions([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="questionText">Question *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={loading || suggesting}
              >
                {suggesting ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3 w-3" />
                )}
                Suggest
              </Button>
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
                    onClick={() => applySuggestion(suggestion)}
                    className="block w-full rounded-lg border-2 border-ink bg-brand-yellow/20 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-brand-yellow/40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
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
              className="flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                className="flex h-11 w-full rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
            <Button type="submit" disabled={loading}>
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
