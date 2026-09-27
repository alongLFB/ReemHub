import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";

export default async function CirclePage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId();
  const { slug } = await params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) {
    notFound();
  }

  const { circle } = membership;
  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href="/app">← 我的圈子</Link>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">{membership.role}</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight">{circle.name}</h1>
            <p className="mt-3 max-w-2xl text-[var(--muted)]">{circle.description || "暂无圈子简介。"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-semibold" href={"/app/circles/" + slug + "/profile"}>我的资料可见性</Link>
            <Link className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-semibold" href={"/app/circles/" + slug + "/manage"}>圈子管理与邀请</Link>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["群友录", "查看已公开的成员资料", "/directory"],
            ["美食指南", "沉淀圈内餐厅推荐", "/restaurants"],
            ["活动", "报名、候补与活动提醒", "/events"],
            ["AA 账单", "独立或关联活动的分摊", "/bills"],
          ].map(([title, description, path]) => (
            <Link className="rounded-3xl border border-[var(--line)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-sm" href={"/app/circles/" + slug + path} key={title}>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
