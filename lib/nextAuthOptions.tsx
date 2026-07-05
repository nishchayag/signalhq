import userModel from "@/models/user.model";
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import connectDB from "@/lib/connectDB";
import bcrypt from "bcryptjs";
import { getActiveOrgForToken } from "@/lib/orgContext";
import { checkRateLimit } from "@/lib/rateLimit";
const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: {
          label: "Email/Username",
          type: "text",
          placeholder: "your-email-or-username",
        },
        password: {
          label: "Password",
          type: "password",
          placeholder: "your-password",
        },
      },
      async authorize(credentials, req) {
        const { identifier, password } = credentials as {
          identifier: string;
          password: string;
        };
        if (!identifier || !password) {
          throw new Error("Email/Username and password are required");
        }
        await connectDB();
        try {
          // Usernames/emails are stored lowercase; normalize so "Abc"
          // logs in as "abc".
          const normalized = identifier.trim().toLowerCase();

          // Throttle credential stuffing. Keyed per IP + target account so
          // an attacker can't brute-force one account, while other people's
          // logins from other networks are unaffected. (authorize gets a
          // plain header record, not a NextRequest, hence no getClientIp.)
          const forwarded = req?.headers?.["x-forwarded-for"] as
            | string
            | undefined;
          const ip =
            forwarded?.split(",")[0].trim() ||
            (req?.headers?.["x-real-ip"] as string | undefined) ||
            "unknown";
          const allowed = await checkRateLimit(
            `login:${ip}:${normalized}`,
            10,
            10 * 60 * 1000
          );
          if (!allowed) {
            throw new Error(
              "Too many login attempts. Please try again in a few minutes."
            );
          }

          const userInDB = await userModel.findOne({
            $or: [{ email: normalized }, { username: normalized }],
          });
          if (!userInDB) {
            throw new Error("No user found with the provided email/username");
          } else {
            const isPasswordValid = await bcrypt.compare(
              password,
              userInDB.password
            );
            if (!isPasswordValid) {
              throw new Error(
                "Invalid username/email - password combination, Please try again"
              );
            }
            if (!userInDB.isVerified) {
              throw new Error("Please verify your email before logging in");
            }
            return userInDB;
          }
        } catch (error: unknown) {
          console.error("Error during authorization:", error);
          throw new Error((error as Error).message);
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token._id = user._id?.toString();
        token.isVerified = user.isVerified;
        token.username = user.username;
        token.name = user.name;

        // Stamp the user's default (personal) org onto the token at sign-in.
        await connectDB();
        const org = await getActiveOrgForToken(token._id as string);
        token.activeOrgId = org?.organizationId;
        token.activeOrgSlug = org?.slug;
        token.activeOrgRole = org?.role;
        token.activeOrgPlan = org?.plan;
      }

      // Client calls `update({ activeOrgId })` to switch orgs, or a bare
      // `update()` to refresh the currently active org's data in place (e.g.
      // after switching plans, so the navbar badge updates without a full
      // reload). Falls back to the token's current org when no explicit
      // `activeOrgId` is requested. Always DB-validated.
      if (trigger === "update" && token._id) {
        const desiredOrgId =
          (session?.activeOrgId as string | undefined) ??
          (token.activeOrgId as string | undefined);
        if (desiredOrgId) {
          await connectDB();
          const org = await getActiveOrgForToken(
            token._id as string,
            desiredOrgId
          );
          if (org) {
            token.activeOrgId = org.organizationId;
            token.activeOrgSlug = org.slug;
            token.activeOrgRole = org.role;
            token.activeOrgPlan = org.plan;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user._id = token._id;
        session.user.isVerified = token.isVerified;
        session.user.username = token.username;
        session.user.name = token.name;
        session.user.activeOrgId = token.activeOrgId;
        session.user.activeOrgSlug = token.activeOrgSlug;
        session.user.activeOrgRole = token.activeOrgRole;
        session.user.activeOrgPlan = token.activeOrgPlan;
      }
      return session;
    },
  },
  pages: {
    signIn: "/Login",
  },

  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
