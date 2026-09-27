"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Mode = "login" | "register" | "verify";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      toast.error("邮箱、密码或验证状态不正确。");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/register/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, email, password }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      toast.error(body.error ?? "验证码发送失败。");
      return;
    }
    toast.success("验证码已发送，请查收邮箱。");
    setMode("verify");
  }

  async function completeRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/register/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      toast.error(body.error ?? "注册失败。");
      return;
    }
    toast.success("账户已创建，请登录。");
    setMode("login");
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
      <Link className="text-lg font-bold text-[var(--brand)]" href="/">UAEHub</Link>
      <h1 className="mt-6 text-3xl font-bold">
        {mode === "login" ? "欢迎回来" : mode === "register" ? "创建你的账户" : "验证邮箱"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        {mode === "login"
          ? "登录后即可创建、发现或申请加入圈子。"
          : mode === "register"
            ? "先完成邮箱验证，再开始你的 UAEHub 旅程。"
            : "请输入发送到邮箱的 6 位验证码。"}
      </p>

      {mode === "login" && (
        <form className="mt-6 space-y-4" onSubmit={login}>
          <Field label="邮箱" type="email" value={email} onChange={setEmail} required />
          <Field label="密码" type="password" value={password} onChange={setPassword} required />
          <Submit loading={loading}>登录</Submit>
        </form>
      )}

      {mode === "register" && (
        <form className="mt-6 space-y-4" onSubmit={requestCode}>
          <Field label="常用称呼" value={displayName} onChange={setDisplayName} required />
          <Field label="邮箱" type="email" value={email} onChange={setEmail} required />
          <Field label="密码（至少 10 位）" type="password" value={password} onChange={setPassword} minLength={10} required />
          <Submit loading={loading}>发送验证码</Submit>
        </form>
      )}

      {mode === "verify" && (
        <form className="mt-6 space-y-4" onSubmit={completeRegistration}>
          <Field label="6 位验证码" value={code} onChange={setCode} inputMode="numeric" maxLength={6} required />
          <Submit loading={loading}>完成注册</Submit>
        </form>
      )}

      {mode !== "verify" && googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" /> 或 <span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <button
            className="w-full rounded-xl border border-[var(--line)] px-4 py-3 font-semibold"
            onClick={() => signIn("google", { callbackUrl: "/app" })}
            type="button"
          >
            使用 Google 继续
          </button>
        </>
      )}

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        {mode === "login" ? "还没有账户？" : "已有账户？"}
        <button
          className="ml-1 font-semibold text-[var(--brand)]"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          type="button"
        >
          {mode === "login" ? "去注册" : "去登录"}
        </button>
      </p>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 outline-none transition focus:border-[var(--brand)]"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
        {...props}
      />
    </label>
  );
}

function Submit({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      type="submit"
    >
      {loading ? "请稍候…" : children}
    </button>
  );
}
