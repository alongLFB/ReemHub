import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { RestaurantList } from "./restaurant-list";

export default async function RestaurantsPage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId();
  const { slug } = await params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) notFound();
  const restaurants = await prisma.restaurant.findMany({
    where: { circleId: membership.circleId },
    include: { createdBy: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href={"/app/circles/" + slug}>← {membership.circle.name}</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">美食指南</h1>
        <p className="mt-3 text-[var(--muted)]">每位圈友都可以立即贡献推荐；创建者和管理员可维护内容。</p>
        <RestaurantList canManage={membership.role === "OWNER" || membership.role === "ADMIN"} currentUserId={userId} initialRestaurants={restaurants.map((item) => ({
          id: item.id,
          name: item.name,
          cuisine: item.cuisine,
          area: item.area,
          mapsUrl: item.mapsUrl,
          avgSpendAed: item.avgSpendAed?.toString() ?? null,
          notes: item.notes,
          creatorName: item.createdBy.displayName || "圈友",
          createdById: item.createdById,
        }))} slug={slug} />
      </section>
    </main>
  );
}
