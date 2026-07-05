"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldErrors, useForm } from "react-hook-form";
import * as z from "zod";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebounceValue } from "usehooks-ts";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { signupSchema } from "@/schemas/signUpSchema";
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
  // Registered once so the custom onChange below can forward to it (the
  // inline minLength rule is redundant with the zod resolver anyway).
  const usernameField = register("username");

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
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.error
        : null;
      toast.error(msg || "Error signing up, please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border-2 border-ink bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition";

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-dot-grid px-4 py-16">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 shadow-solid-lg">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-mint text-ink">
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start collecting honest feedback in seconds
          </p>
        </div>

        <form
          onSubmit={handleSubmit(handleSubmitForm, handleFormErrors)}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              {...usernameField}
              onChange={(e) => {
                // Usernames are lowercase-unique; lowering as the user types
                // beats rejecting "Abc" at submit. Forward to react-hook-form's
                // onChange (which this prop otherwise replaces) so the form
                // state stays in sync.
                e.target.value = e.target.value.toLowerCase();
                usernameField.onChange(e);
                setUsername(e.target.value);
              }}
              className={inputClass}
              placeholder="yourhandle"
            />
            {isCheckingUsername && (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking
                username...
              </p>
            )}
            {usernameAvailableMessage && (
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-sm ${
                  isAvailable ? "text-emerald-500" : "text-destructive"
                }`}
              >
                {isAvailable ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <X className="h-4 w-4" />
                )}{" "}
                {usernameAvailableMessage}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              {...register("email")}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              {...register("name")}
              className={inputClass}
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                {...register("password")}
                className={`${inputClass} pr-11`}
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Confirm password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                {...register("confirmPassword")}
                className={`${inputClass} pr-11`}
                placeholder="Re-enter your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Toggle password visibility"
              >
                {showConfirmPassword ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary py-2.5 text-sm font-bold text-primary-foreground pop disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Page;
