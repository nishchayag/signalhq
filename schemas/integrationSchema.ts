import { z } from "zod";
import {
  INTEGRATION_EVENTS,
  INTEGRATION_KINDS,
  INTEGRATION_NAME_MAX,
  INTEGRATION_PAYLOAD_MODES,
} from "@/lib/integrationConstants";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(INTEGRATION_NAME_MAX, `Name cannot exceed ${INTEGRATION_NAME_MAX} characters`);

// URL syntax/safety (https-only, no userinfo, no IP-literal host, Slack
// host/path allowlist) is validated by lib/safeHttp.ts#validateTargetUrl in
// the route, not here — the schema just bounds the raw string length.
const urlSchema = z.string().trim().min(1, "URL is required").max(2048);

const eventsSchema = z
  .array(z.enum(INTEGRATION_EVENTS))
  .min(1, "Choose at least one event")
  .max(INTEGRATION_EVENTS.length);

// POST /api/organizations/:orgId/integrations
export const createIntegrationSchema = z
  .object({
    kind: z.enum(INTEGRATION_KINDS),
    name: nameSchema,
    url: urlSchema,
    payloadMode: z.enum(INTEGRATION_PAYLOAD_MODES).optional(),
    events: eventsSchema.optional(),
  })
  .strict();

// PATCH /api/organizations/:orgId/integrations/:integrationId — any subset,
// at least one key. `url` (if present) is re-validated/re-sealed in the
// route; `kind` can never change after creation.
export const updateIntegrationSchema = z
  .object({
    name: nameSchema.optional(),
    enabled: z.boolean().optional(),
    payloadMode: z.enum(INTEGRATION_PAYLOAD_MODES).optional(),
    events: eventsSchema.optional(),
    url: urlSchema.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

export type CreateIntegrationRequest = z.infer<typeof createIntegrationSchema>;
export type UpdateIntegrationRequest = z.infer<typeof updateIntegrationSchema>;
