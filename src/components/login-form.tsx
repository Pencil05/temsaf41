"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await login(username, password);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    router.replace(result.user.role === "Admin" ? "/admin/dashboard" : "/user/dashboard");
    router.refresh();
  }

  return (
    <div className="rounded-[28px] border border-white/80 bg-white/40 px-6 py-8 text-left shadow-[0_18px_50px_rgba(78,94,164,0.15)] backdrop-blur-md sm:px-8 sm:py-9">
      <div>
        <h2 className="text-3xl text-center font-bold tracking-tight text-slate-950">Welcome</h2>
        <p className="mt-1.5 text-sm text-center text-slate-500">Sign in to continue</p>
      </div>

      <form className="mt-7 space-y-4" onSubmit={handleSubmit} noValidate>
        <label className="relative block">
          <span className="sr-only">Username</span>
          <UserRound
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
          />
          <input
            type="email"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="h-14 w-full rounded-xl border border-slate-200 bg-white px-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            required
          />
        </label>

        <label className="relative block">
          <span className="sr-only">Password</span>
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
          />
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="h-14 w-full rounded-xl border border-slate-200 bg-white px-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((isVisible) => !isVisible)}
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <Link
          href="/forgot-password"
          className="ml-auto block text-right text-sm font-medium text-blue-600 transition hover:text-blue-700 focus:outline-none focus:underline"
        >
          Forgot password ?
        </Link>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-14 w-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-sm font-bold tracking-[0.14em] text-white shadow-[0_10px_22px_rgba(79,70,229,0.3)] transition hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-4 focus:ring-blue-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="flex items-center justify-center gap-2">
            {isSubmitting && <LoaderCircle className="size-5 animate-spin" />}
            {isSubmitting ? "กำลังดาวน์โหลดข้อมูล..." : "SIGN IN"}
          </span>
        </button>
      </form>
    </div>
  );
}
