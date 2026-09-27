import { LoginForm } from "./login-form";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <Suspense fallback={<div className="text-sm text-[var(--muted)]">正在加载登录页…</div>}>
        <LoginForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
      </Suspense>
    </main>
  );
}
