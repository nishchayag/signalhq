"use client";
import React, { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";

interface CreateQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionCreated: (question: IQuestion) => void;
}

export default function CreateQuestionDialog({
  open,
  onOpenChange,
  onQuestionCreated,
}: CreateQuestionDialogProps) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateQuestionRequest>({
    resolver: zodResolver(createQuestionSchema),
  });

  const onSubmit = async (data: CreateQuestionRequest) => {
    setLoading(true);
    try {
      const response = await axios.post("/api/questions", data);
      if (response.data.success) {
        onQuestionCreated(response.data.question);
        reset();
        onOpenChange(false);
      } else {
        toast.error(response.data.message || "Failed to create question");
      }
    } catch (error) {
      console.error("Error creating question:", error);
      toast.error("Failed to create question");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Question</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="questionText">Question *</Label>
            <Textarea
              id="questionText"
              {...register("questionText")}
              placeholder="What would you like to ask your audience?"
              className="min-h-[80px] resize-none"
              disabled={loading}
            />
            {errors.questionText && (
              <p className="text-sm text-red-600">
                {errors.questionText.message}
              </p>
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
              <p className="text-sm text-red-600">
                {errors.description.message}
              </p>
            )}
          </div>

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
                  Creating...
                </>
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
