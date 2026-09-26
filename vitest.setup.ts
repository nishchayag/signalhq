// Never let a test reach the real AI provider: vercel.json runs the suite
// with the production MISTRAL_API_KEY in the environment. Tests that need AI
// "on" mock "@/lib/ai" (test-utils/aiMock.ts) or set a fake key explicitly.
delete process.env.MISTRAL_API_KEY;
delete process.env.AI_DISABLED;
