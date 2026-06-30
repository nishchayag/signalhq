"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldErrors, useForm } from "react-hook-form";
import * as z from "zod";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { signupSchema } from "@/schemas/signUpSchema";
import { LoaderCircle, Check, X } from "lucide-react";
import Link from "next/link";

const Page = () => {
  const [username, setUsername] = useState("");
  const [usernameAvailableMessage, setUsernameAvailableMessage] = useState("");
  const [lastCheckedUsername, setLastCheckedUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [debouncedUsername] = useDebounceValue(username, 1000);
  const router = useRouter();
  const [isAvailable, setIsAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register, handleSubmit } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: "",
      email: "",
      name: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const checkUsernameUnique = async () => {
      if (debouncedUsername.length === 0) {
        setUsernameAvailableMessage("");
        setLastCheckedUsername("");
        return;
      }

      if (!debouncedUsername || debouncedUsername === lastCheckedUsername) {
        return;
      }
      if (!debouncedUsername.match(/^[a-zA-Z0-9_]+$/)) {
        setUsernameAvailableMessage(
          "Username can only contain letters, numbers, and underscores."
        );
        setIsAvailable(false);
        return;
      }
      if (debouncedUsername) {
        setIsCheckingUsername(true);
        setUsernameAvailableMessage("");
        try {
          if (debouncedUsername.length < 4) {
            setUsernameAvailableMessage(
              "Username must be at least 4 characters long."
            );
            return;
          }
          const response = await axios.get(
            `/api/auth/checkUsernameUnique?username=${debouncedUsername}`
          );
          setIsAvailable(response.data.success);
          setUsernameAvailableMessage(response.data.message);
          setLastCheckedUsername(debouncedUsername);
        } catch (error: unknown) {
          console.error("Error checking username uniqueness:", error);
          toast.error("Error checking username uniqueness", {
            description: (error as Error).message,
          });
        } finally {
          setIsCheckingUsername(false);
        }
      }
    };
    checkUsernameUnique();
  }, [debouncedUsername, lastCheckedUsername]);

  const handleFormErrors = (
    errors: FieldErrors<z.infer<typeof signupSchema>>
  ) => {
    if (errors.password) {
      toast.error(
        "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      );
    }
    if (errors.username) {
      toast.error(
        "Username can only contain letters, numbers, and underscores, should be between 4 and 20 characters long."
      );
    }
  };

  const handleSubmitForm = async (data: z.infer<typeof signupSchema>) => {
    setLoading(true);
    try {
      if (
        !data.password.match(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/
        )
      ) {
        toast.error(
          "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character."
        );
        return;
      }
      if (data.password !== data.confirmPassword) {
        toast.error("Password and Confirm Password do not match.");
        return;
      }

      const response = await axios.post("/api/auth/signup", data);
      if (response.data.success) {
        toast.success("Signup successful! Redirecting to Verify Email page...");
        // Carry a relative ?callbackUrl through the verify → login chain so an
        // invited new user lands back on the invite after verifying.
        const cb = new URLSearchParams(window.location.search).get(
          "callbackUrl"
        );
        const safe = cb && cb.startsWith("/") && !cb.startsWith("//");
        const cbParam = safe
          ? `&callbackUrl=${encodeURIComponent(cb!)}`
          : "";
        router.push(
          `/verifyEmail?username=${data.username}&email=${data.email}${cbParam}`
        );
      } else {
        toast.error(
          response.data.error || "Incorrect credentials, please try again."
        );
      }
    } catch (error) {
      console.error("Error signing up:", error);
      toast.error("Error signing up, please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Signup Page
        </h1>

        <form
          onSubmit={handleSubmit(handleSubmitForm, handleFormErrors)}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              {...register("username", { minLength: 4 })}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {isCheckingUsername && (
              <p className="flex items-center gap-2 text-blue-600 mt-1 text-sm">
                <LoaderCircle className="animate-spin" /> Checking username...
              </p>
            )}
            {usernameAvailableMessage && (
              <p
                className={`flex items-center gap-2 mt-1 text-sm ${
                  isAvailable ? "text-green-600" : "text-red-600"
                }`}
              >
                {isAvailable ? <Check /> : <X />} {usernameAvailableMessage}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              {...register("email")}
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              {...register("name")}
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
          <div className="flex flex-col">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm Password
            </label>
            <div className="flex gap-2">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                {...register("confirmPassword")}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="right-2 top-9 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? <Eye /> : <EyeOff />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded-md font-medium transition-colors ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? "Loading..." : "Sign Up"}
          </button>
        </form>
        <p className="mt-6 text-sm text-center text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Page;
