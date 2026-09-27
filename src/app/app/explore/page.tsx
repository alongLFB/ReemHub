import Link from "next/link";
import { CircleVisibility } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { JoinCircleButton } from "./join-circle-button";

export default async function ExplorePage() {
  const userId = await requireCurrentUserId();
  const circles = await prisma.circle.findMany({
    where: { visibility: CircleVisibility.PUBLIC, status: "ACTIVE" },
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
      memberships: {
        where: { userId },
        select: { status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href="/app">← 我的圈子</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">发现公开圈子</h1>
        <p className="mt-3 text-[var(--muted)]">公开只代表可发现。餐厅、活动、成员和账单都要在申请获批后才能查看。</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {circles.map((circle) => {
            const status = circle.memberships[0]?.status;
            return (
              <article className="rounded-3xl border border-[var(--line)] bg-white p-5" key={circle.id}>
                <p className="text-xs font-semibold text-[var(--brand)]">{circle._count.memberships} 位成员 · 由 {circle.creator.displayName || "圈主"} 创建</p>
                <h2 className="mt-2 text-xl font-bold">{circle.name}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted)]">{circle.description || "这个圈子还没有简介。"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {circle.tags.map((tag) => <span className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-xs text-[var(--brand)]" key={tag}>#{tag}</span>)}
                </div>
                <JoinCircleButton slug={circle.slug} status={status} />
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
