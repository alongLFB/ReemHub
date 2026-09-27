import Link from "next/link";
import { NewCircleForm } from "./new-circle-form";

export default function NewCirclePage() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href="/app">← 我的圈子</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">创建一个圈子</h1>
        <p className="mt-3 leading-7 text-[var(--muted)]">你会成为圈子创建者。公开圈子能在广场被发现；私密圈子只能通过邀请被发现。</p>
        <NewCircleForm />
      </section>
    </main>
  );
}
