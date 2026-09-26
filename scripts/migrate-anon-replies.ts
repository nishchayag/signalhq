// Run on the production DB on 2026-09-24 (migrated 2; a re-check found 0 left).
// One-off, idempotent migration: fold the legacy single `reply` of anonymous
// messages into `replies[]` as an "org" turn, then drop `reply`.
//
//   node --env-file=.env scripts/migrate-anon-replies.ts --dry-run   # count only
//   node --env-file=.env scripts/migrate-anon-replies.ts             # apply
//
// (Node >= 23.6 runs .ts directly; this file imports only packages, so no
// path aliases or loaders are needed.) Prints counts only, never content.
// Each doc is updated with ONE conditional updateOne({_id, reply: exists}),
// so a re-run — or two runs racing — can't add a second org turn.
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import type { Collection, Document } from "mongodb";

export interface MigrateResult {
  matched: number; // docs that still have `reply`
  migrated: number; // got an org turn + `reply` removed
  cleared: number; // `reply` removed only (empty, or already in replies)
}

const FILTER = { reply: { $exists: true }, authorType: { $ne: "member" } };

export async function migrateAnonReplies(
  coll: Collection<Document>,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<MigrateResult> {
  const result: MigrateResult = { matched: await coll.countDocuments(FILTER), migrated: 0, cleared: 0 };
  if (dryRun) return result;

  const cursor = coll.find(FILTER, { projection: { reply: 1, replies: 1 } });
  for await (const doc of cursor) {
    const reply = doc.reply as { content?: unknown; repliedAt?: unknown } | null;
    const content = typeof reply?.content === "string" ? reply.content : "";
    const repliedAt = reply?.repliedAt instanceof Date ? reply.repliedAt : null;
    const replies = (Array.isArray(doc.replies) ? doc.replies : []) as {
      authorRole?: string;
      content?: string;
      createdAt?: Date;
    }[];
    const already =
      !!repliedAt &&
      replies.some(
        (r) =>
          r.authorRole === "org" &&
          r.content === content &&
          r.createdAt instanceof Date &&
          r.createdAt.getTime() === repliedAt.getTime()
      );

    const guard = { _id: doc._id, reply: { $exists: true } };
    if (content && repliedAt && !already) {
      const res = await coll.updateOne(guard, {
        $push: {
          replies: {
            _id: new mongoose.Types.ObjectId(),
            authorRole: "org",
            content,
            createdAt: repliedAt,
          },
        },
        $unset: { reply: "" },
        $max: { lastActivityAt: repliedAt },
      } as Document);
      if (res.modifiedCount > 0) result.migrated++;
    } else {
      const res = await coll.updateOne(guard, { $unset: { reply: "" } });
      if (res.modifiedCount > 0) result.cleared++;
    }
  }
  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set (run with --env-file=.env)");
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const coll = mongoose.connection.collection("messages");
    const result = await migrateAnonReplies(coll, { dryRun });
    console.log(
      dryRun
        ? `[dry run] ${result.matched} message(s) have a legacy reply to migrate.`
        : `Migrated ${result.migrated}, cleared ${result.cleared} (of ${result.matched} matched).`
    );
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.name : typeof err);
    process.exit(1);
  });
}
