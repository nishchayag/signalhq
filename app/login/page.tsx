"use client";
import { signinSchema } from "@/schemas/signInSchema";
import Link from "next/link";
import React from "react";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import * as z from "zod";
import { toast } from "sonner";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
const Page = () => {
  const { register, handleSubmit } = useForm<z.infer<typeof signinSchema>>();
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleSubmitFunction = async (data: z.infer<typeof signinSchema>) => {
    setLoading(true);
    try {
      if (!data.identifier || !data.password) {
        toast.error("All fields are required");
        setLoading(false);
        return;
      }
      const response = await signIn("credentials", {
        identifier: data.identifier,
        password: data.password,
        redirect: false,
      });
      if (!response) {
        toast.error("No response from server");
        return;
      }
      if (response?.error) {
        toast.error(response.error);
        return;
      } else if (response?.ok) {
        toast.success("Login successful");
        // Honor a relative ?callbackUrl (e.g. returning to an invite link).
        const cb = new URLSearchParams(window.location.search).get(
          "callbackUrl"
        );
        const safe = cb && cb.startsWith("/") && !cb.startsWith("//");
        router.push(safe ? cb! : "/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Login to Your Account
        </h1>

        <form
          onSubmit={handleSubmit(handleSubmitFunction)}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="identifier"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Username or Email
            </label>
            <input
              type="text"
              id="identifier"
              {...register("identifier")}
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter your username or email"
            />
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                {...register("password")}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="right-2 top-9 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <Eye /> : <EyeOff />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-gray-600">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Page;
