import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
  },
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      "Please enter a valid email address",
    ],
  },
  verifyCode: String,
  verifyCodeExpiry: Date,
  forgotPasswordCode: String,
  forgotPasswordCodeExpiry: Date,
  isVerified: {
    type: Boolean,
    default: false,
  },
  notificationPreference: {
    type: String,
    enum: ["immediate", "daily", "off"],
    default: "daily",
  },
  // Count of new messages received since the last daily digest was sent.
  // Only incremented (and read) when notificationPreference === "daily";
  // reset to 0 once the digest email goes out.
  pendingNotificationCount: {
    type: Number,
    default: 0,
  },
});

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

export default UserModel;
