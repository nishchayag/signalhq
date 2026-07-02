import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  // Check the live connection state rather than a cached flag — a socket can
  // drop (e.g. a dropped TLS session) after the first successful connect, and
  // a stale flag would then skip reconnecting on every subsequent request.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // family: 4 forces IPv4 — Atlas TLS handshakes over IPv6 intermittently fail
  // with "tlsv1 alert internal error" on some networks.
  await mongoose.connect(process.env.MONGODB_URI as string, { family: 4 });
  console.log("MongoDB connected successfully");
};

export default connectDB;
