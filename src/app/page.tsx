import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { readSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = readSessionValue((await cookies()).get(SESSION_COOKIE_NAME)?.value);

  if (user) {
    redirect(user.role === "Admin" ? "/admin/dashboard" : "/user/dashboard");
  }

  return (
    <main className="theme-auth-page relative flex h-dvh items-center justify-center overflow-hidden px-4 py-3 sm:px-8 sm:py-6">
      <ThemeToggle className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5" />
      <div className="login-glow login-glow-top" />
      <div className="login-glow login-glow-middle" />
      <div className="login-glow login-glow-bottom" />

      <section className="relative z-10 w-full max-w-[390px] text-center">
        <div className="mb-3 flex flex-col items-center sm:mb-5">
          <div className="flex size-[112px] items-center justify-center overflow-hidden rounded-full p-1 sm:size-[145px] min-[800px]:size-[170px]">
            <Image
              src="/changprai.png"
              alt="ตราสัญลักษณ์กองพันทหารอากาศโยธิน กองบิน 41"
              width={200}
              height={200}
              priority
              className="size-full"
            />
          </div>
          <h1 className="mt-2 text-lg font-bold tracking-tight text-blue-600 sm:mt-3 sm:text-xl">
            กองพันทหารอากาศโยธิน กองบิน 41
          </h1>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
