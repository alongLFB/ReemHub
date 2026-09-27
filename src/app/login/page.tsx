import { LoginForm } from "./login-form";
import { Suspense } from "react";
import { getServerEnv } from "@/config/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const env = getServerEnv();
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <Suspense fallback={<div className="text-sm text-[var(--muted)]">正在加载登录页…</div>}>
        <LoginForm googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} />
      </Suspense>
    </main>
  );
}
