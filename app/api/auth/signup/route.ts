import connectDB from "@/lib/connectDB";
import { NextResponse, NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import userModel from "@/models/user.model";
import { sendEmail } from "@/lib/mailService";
import { createPersonalOrganization } from "@/lib/orgContext";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { signupSchema } from "@/schemas/signUpSchema";
import { deleteUnverifiedUser } from "@/lib/orgCleanup";
import { generateOtp, otpExpiry } from "@/lib/otp";

// confirmPassword is a client-side concern (the form checks it matches);
// the API only needs the four real fields, validated by the same schema the
// form uses so a direct API call can't skip the password/username rules.
const signupBodySchema = signupSchema.omit({ confirmPassword: true });

// An unverified signup whose code expired over a day ago no longer holds its
// email/username — a real person trying again shouldn't be blocked by it.
const STALE_UNVERIFIED_MS = 24 * 60 * 60 * 1000;

type ExistingUser = { _id: unknown; isVerified?: boolean; verifyCodeExpiry?: Date } | null;

function isStaleUnverified(user: ExistingUser): boolean {
  return Boolean(
    user &&
      !user.isVerified &&
      user.verifyCodeExpiry &&
      user.verifyCodeExpiry.getTime() < Date.now() - STALE_UNVERIFIED_MS
  );
}

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    // Every successful signup emails an OTP to an arbitrary address —
    // throttle like the other OTP-sending auth routes.
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`signup:${ip}`, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many signup attempts. Please try again in a few minutes.",
          success: false,
        },
        { status: 429 }
      );
    }

    const result = signupBodySchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error.issues.map((issue) => issue.message).join(", "),
          success: false,
        },
        { status: 400 }
      );
    }
    // Stored lowercase (lowercase-unique), so normalize before the
    // existence checks too — "Abc" must collide with "abc".
    const { password, name } = result.data;
    const email = result.data.email.toLowerCase();
    const username = result.data.username.toLowerCase();

    let existingUserByEmail = (await userModel.findOne({ email })) as ExistingUser;
    let existingUserByUsername = (await userModel.findOne({ username })) as ExistingUser;

    // Free up identifiers held by long-expired, never-verified signups.
    for (const stale of [existingUserByEmail, existingUserByUsername]) {
      if (isStaleUnverified(stale)) await deleteUnverifiedUser(stale!._id as string);
    }
    if (isStaleUnverified(existingUserByEmail)) existingUserByEmail = null;
    if (isStaleUnverified(existingUserByUsername)) existingUserByUsername = null;

    if (existingUserByEmail) {
      return NextResponse.json(
        { error: "Email already in use", success: false },
        { status: 409 }
      );
    }
    if (existingUserByUsername) {
      return NextResponse.json(
        {
          error: "Username already taken, Please choose a different username",
          success: false,
        },
        { status: 409 }
      );
    }

    // Hash only once we know we'll actually create the user.
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateOtp();

    const newUser = await userModel.create({
      email,
      password: hashedPassword,
      username,
      name,
      verifyCode: verificationCode,
      verifyCodeExpiry: otpExpiry(),
    });
    // Don't log the created doc — it carries the password hash and OTP.
    console.log("New user created:", newUser.username);

    // Give every new account a personal organization (OWNER) so the org-scoped
    // dashboard works immediately on first login. No transaction available
    // (standalone Mongo in tests), so roll the user back by hand if this
    // fails — including a half-created org whose membership didn't land.
    try {
      await createPersonalOrganization({
        _id: newUser._id,
        name: newUser.name,
        username: newUser.username,
      });
    } catch (error) {
      await deleteUnverifiedUser(newUser._id);
      throw error;
    }

    const emailSent = await sendEmail({
      email,
      mailType: "VERIFY",
      otpCode: verificationCode,
    });

    return NextResponse.json({
      success: true,
      emailSent,
      message: emailSent
        ? "User created successfully, verification email sent"
        : "Account created, but we couldn't send your verification email. Use \"Resend code\" on the next page.",
    });
  } catch (error) {
    // A concurrent signup can win the unique-index race after our
    // existence checks passed.
    if ((error as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { error: "Email or username already in use", success: false },
        { status: 409 }
      );
    }
    console.error("Error in signup route:", error);
    return NextResponse.json(
      { error: "Something went wrong while signing up. Please try again.", success: false },
      { status: 500 }
    );
  }
}
