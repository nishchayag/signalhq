import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import authOptions, { INVALID_CREDENTIALS } from "@/lib/nextAuthOptions";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

type Authorize = (
  credentials: Record<string, string>,
  req: { headers: Record<string, string> }
) => Promise<unknown>;

// next-auth v4 keeps the user-supplied authorize on provider.options.
const provider = authOptions.providers[0] as unknown as { options: { authorize: Authorize } };
let n = 0;
const login = (identifier: string, password: string) =>
  provider.options.authorize(
    { identifier, password },
    { headers: { "x-forwarded-for": `10.1.0.${++n}` } }
  );

async function makeUser(isVerified: boolean) {
  return UserModel.create({
    name: "Real Person",
    username: "realuser",
    email: "real@example.com",
    password: await bcrypt.hash("Correct#1pass", 10),
    isVerified,
  });
}

describe("credentials authorize — no account enumeration", () => {
  it("gives the identical error for a missing account and a wrong password", async () => {
    await makeUser(true);
    const missing = await login("nobody@example.com", "whatever").catch((e: Error) => e.message);
    const wrongPw = await login("real@example.com", "Wrong#1pass").catch((e: Error) => e.message);
    expect(missing).toBe(INVALID_CREDENTIALS);
    expect(wrongPw).toBe(INVALID_CREDENTIALS);
  });

  it("only mentions verification after the correct password", async () => {
    await makeUser(false);
    const wrongPw = await login("realuser", "Wrong#1pass").catch((e: Error) => e.message);
    const rightPw = await login("realuser", "Correct#1pass").catch((e: Error) => e.message);
    expect(wrongPw).toBe(INVALID_CREDENTIALS);
    expect(rightPw).toBe("Please verify your email before logging in");
  });

  it("logs in a verified user with the right password, case-insensitively", async () => {
    await makeUser(true);
    const user = (await login("REAL@example.com", "Correct#1pass")) as { username: string };
    expect(user.username).toBe("realuser");
  });
});
