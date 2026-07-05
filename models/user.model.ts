import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    match: [/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces"],
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
  messages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  ],
});

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

export default UserModel;
