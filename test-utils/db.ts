import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod: MongoMemoryServer | undefined;

/**
 * Starts a dedicated in-memory Mongo instance for the calling test file and
 * points both this file's own mongoose calls and any SUT that reads
 * process.env.MONGODB_URI (e.g. lib/apiAuth.ts's internal connectDB() call)
 * at it. One server per file, not shared globally, to avoid cross-file
 * coupling to Vitest's worker-reuse/module-isolation semantics.
 */
export async function startTestDB(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Unconditional overwrite — never trust whatever a dev's shell/.env has.
  process.env.MONGODB_URI = uri;

  // Don't trust readyState here: if Vitest reused this worker process for a
  // prior test file, mongoose's connection singleton may still read "open"
  // against a memory server that's already been stopped.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);

  // Avoid unique-index races (e.g. Membership's {organizationId,userId}
  // index) being not-yet-built when the first assertions run.
  await Promise.all(
    Object.values(mongoose.connection.models).map((m) => m.init())
  );
}

export async function clearTestDB(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
  );
}

export async function stopTestDB(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = undefined;
}
