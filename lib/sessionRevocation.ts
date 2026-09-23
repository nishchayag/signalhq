import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";

/**
 * Thrown from the jwt callback when a token's tokenVersion no longer matches
 * the user's (or the user is gone). next-auth's session route catches any
 * jwt-callback throw, clears the session cookie and returns `{}`, so
 * getServerSession() yields null and useSession() goes unauthenticated.
 * Returning `{}`/null from the callback instead would NOT log the user out.
 */
export const SESSION_REVOKED = "SESSION_REVOKED";

export type SessionUserSnapshot = {
  name?: string;
  email?: string;
  tokenVersion: number;
};

/**
 * The user's current name/email/tokenVersion if `tokenVersion` still matches
 * theirs, else null (user deleted, or every session revoked since this token
 * was issued). A missing tokenVersion on either side counts as 0.
 */
export async function currentSessionUser(
  userId: string,
  tokenVersion: number | undefined
): Promise<SessionUserSnapshot | null> {
  await connectDB();
  const doc = await UserModel.findById(userId)
    .select("tokenVersion name email")
    .lean<{ tokenVersion?: number; name?: string; email?: string }>();
  if (!doc) return null;
  const current = doc.tokenVersion ?? 0;
  if (current !== (tokenVersion ?? 0)) return null;
  return { name: doc.name, email: doc.email, tokenVersion: current };
}
