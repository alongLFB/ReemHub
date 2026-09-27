import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/infrastructure/db/prisma";

export default async function AppPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const memberships = await prisma.circleMembership.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      circle: { status: "ACTIVE" },
    },
    include: {
      circle: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <Link className="text-xl font-bold text-[var(--brand)]" href="/">ReemHub</Link>
        <span className="text-sm text-[var(--muted)]">{session.user.email}</span>
      </nav>
      <section className="mx-auto max-w-5xl py-12">
        <p className="text-sm font-semibold text-[var(--brand)]">我的圈子</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">从一个圈子开始</h1>
            <p className="mt-3 text-[var(--muted)]">创建自己的圈子，或在广场中申请加入公开圈子。</p>
          </div>
          <div className="flex gap-3">
            <Link className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-semibold" href="/app/explore">发现圈子</Link>
            <Link className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white" href="/app/circles/new">创建圈子</Link>
          </div>
        </div>

        {memberships.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-[var(--line)] bg-white p-10 text-center">
            <h2 className="text-xl font-bold">你还没有加入任何圈子</h2>
            <p className="mt-2 text-[var(--muted)]">创建一个私密圈子，或者去广场看看公开圈子。</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map(({ circle, role }) => (
              <Link className="rounded-3xl border border-[var(--line)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-sm" href={"/app/circles/" + circle.slug} key={circle.id}>
                <p className="text-xs font-semibold text-[var(--brand)]">{role}</p>
                <h2 className="mt-2 text-xl font-bold">{circle.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{circle.description || "暂无圈子简介"}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
