import Link from "next/link";
import { EventRegistrationStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { EventList } from "./event-list";

export default async function EventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId();
  const { slug } = await params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) notFound();
  const [events, restaurants] = await Promise.all([
    prisma.event.findMany({
      where: { circleId: membership.circleId },
      include: {
        restaurant: { select: { name: true } },
        creator: { select: { displayName: true } },
        registrations: { select: { userId: true, status: true } },
      },
      orderBy: { eventTime: "asc" },
    }),
    prisma.restaurant.findMany({
      where: { circleId: membership.circleId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href={"/app/circles/" + slug}>← {membership.circle.name}</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">活动</h1>
        <p className="mt-3 text-[var(--muted)]">创建活动、设置人数上限与候补，并在结束前管理报名。</p>
        <EventList initialEvents={events.map((event) => ({
          id: event.id,
          title: event.title,
          eventTime: event.eventTime.toISOString(),
          locationName: event.locationName,
          restaurantName: event.restaurant?.name ?? null,
          maxParticipants: event.maxParticipants,
          waitlistEnabled: event.waitlistEnabled,
          status: event.status,
          creatorName: event.creator.displayName || "圈友",
          going: event.registrations.filter((item) => item.status === EventRegistrationStatus.GOING).length,
          waiting: event.registrations.filter((item) => item.status === EventRegistrationStatus.WAITLIST).length,
          myStatus: event.registrations.find((item) => item.userId === userId)?.status ?? null,
        }))} restaurants={restaurants} slug={slug} />
      </section>
    </main>
  );
}
