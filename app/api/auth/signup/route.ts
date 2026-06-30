import connectDB from "@/lib/connectDB";
import { NextResponse, NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import userModel from "@/models/user.model";
import { sendEmail } from "@/lib/mailService";
import { createPersonalOrganization } from "@/lib/orgContext";

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const { email, password, username, name } = await request.json();
    if (!email || !password || !username || !name) {
      return NextResponse.json({ error: "All fields are required" });
    }

    const existingUserByEmail = await userModel.findOne({ email });
    const existingUserByUsername = await userModel.findOne({ username });
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const verificationCodeExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const hashedPassword = await bcrypt.hash(password, 10);

    if (existingUserByEmail) {
      return NextResponse.json({ error: "Email already in use" });
    }

    if (existingUserByUsername) {
      return NextResponse.json({
        error: "Username already taken, Please choose a different username",
      });
    }
    const newUser = await userModel.create({
      email,
      password: hashedPassword,
      username,
      name,
      verifyCode: verificationCode,
      verifyCodeExpiry: verificationCodeExpiry,
      messages: [],
    });
    console.log("New user created:", newUser);

    // Give every new account a personal organization (OWNER) so the org-scoped
    // dashboard works immediately on first login.
    await createPersonalOrganization({
      _id: newUser._id,
      name: newUser.name,
      username: newUser.username,
    });

    const emailResponse = await sendEmail({
      email,
      mailType: "VERIFY",
      otpCode: verificationCode,
    });

    console.log("Verification email sent to:", email);
    console.log("Email response:", emailResponse);
    return NextResponse.json({
      success: true,
      message:
        "User created successfully, verification email sent" + emailResponse,
    });
  } catch (error) {
    console.error("Error in signup route:", error);
    return NextResponse.json({ error: "Error signing up: " + error });
  }
}
