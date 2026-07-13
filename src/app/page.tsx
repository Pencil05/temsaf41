import { LoginForm } from "@/components/login-form";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
      <div className="login-glow login-glow-top" />
      <div className="login-glow login-glow-middle" />
      <div className="login-glow login-glow-bottom" />

      <section className="relative z-10 w-full max-w-[390px] text-center">
        <div className="mb-8 flex flex-col items-center sm:mb-10">
          <div className="flex size-[200px] items-center justify-center overflow-hidden rounded-full p-1 ">
            <img
              src="/changprai.png"
              alt="ตราสัญลักษณ์กองพันทหารอากาศโยธิน กองบิน 41"
              className="size-full"
            />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-blue-600 sm:text-2xl">
            กองพันทหารอากาศโยธิน กองบิน 41
          </h1>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
