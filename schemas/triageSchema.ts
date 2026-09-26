import { z } from "zod";
import {
  LABEL_COLORS,
  LABEL_NAME_MAX,
  MESSAGE_MAX_LABELS,
  ORG_MAX_LABELS,
} from "@/lib/triageConstants";
import { isValidObjectId } from "@/lib/objectId";

const objectId = z.string().refine((v) => isValidObjectId(v), "Invalid id");

// PATCH /api/messages/:messageId — any subset, at least one key.
export const patchMessageSchema = z
  .object({
    read: z.boolean().optional(),
    archived: z.boolean().optional(),
    labels: z
      .object({
        add: z.array(objectId).max(MESSAGE_MAX_LABELS).optional(),
        remove: z.array(objectId).max(ORG_MAX_LABELS).optional(),
      })
      .strict()
      .refine((l) => (l.add?.length ?? 0) + (l.remove?.length ?? 0) > 0, "Nothing to change")
      .optional(),
    // null unassigns.
    assignedTo: objectId.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

export const BULK_MAX_IDS = 100;

// POST /api/messages/bulk — explicit ids, or a mark-all-read scope.
export const bulkMessagesSchema = z.union([
  z
    .object({
      ids: z.array(objectId).min(1).max(BULK_MAX_IDS),
      action: z.enum(["read", "unread", "archive", "unarchive"]),
    })
    .strict(),
  z
    .object({
      scope: z.union([
        z.object({ general: z.literal(true) }).strict(),
        z.object({ questionId: objectId }).strict(),
      ]),
      action: z.literal("markAllRead"),
    })
    .strict(),
]);

const labelName = z.string().trim().min(1, "Name is required").max(LABEL_NAME_MAX);
const labelColor = z.enum(LABEL_COLORS);

export const createLabelSchema = z.object({ name: labelName, color: labelColor }).strict();

export const updateLabelSchema = z
  .object({ name: labelName.optional(), color: labelColor.optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.color !== undefined, "Nothing to change");

export type PatchMessageRequest = z.infer<typeof patchMessageSchema>;
export type BulkMessagesRequest = z.infer<typeof bulkMessagesSchema>;
