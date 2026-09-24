// Case-insensitive exact-name matcher for Organization.labels guards. The
// schema's uniqueness validator only runs on save(); these atomic updates
// carry the same rule in their filters.
export function exactNameRegex(name: string): RegExp {
  return new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

export type LabelView = { _id: string; name: string; color: string };

export function labelView(l: { _id: unknown; name: string; color: string }): LabelView {
  return { _id: String(l._id), name: l.name, color: l.color };
}
