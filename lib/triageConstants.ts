// Triage limits and the label palette, mongoose-free so client code and
// zod schemas (schemas/triageSchema.ts) can share them with the models.

// Label colours are the design system's brand palette keys (app/globals.css
// --brand-*, exposed as bg-brand-*), so a label renders with existing tokens.
export const LABEL_COLORS = ["yellow", "pink", "mint", "blue"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
export const ORG_MAX_LABELS = 30;
export const LABEL_NAME_MAX = 24;
export const MESSAGE_MAX_LABELS = 5;
