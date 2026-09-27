import { prisma } from "@/infrastructure/db/prisma";
import { canManageCircle, requireActiveMembership } from "@/modules/circle/circle-access";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";

export class RestaurantServiceError extends Error {}

export async function createRestaurant(input: {
  userId: string;
  slug: string;
  name: string;
  cuisine?: string;
  area?: string;
  address?: string;
  mapsUrl?: string;
  avgSpendAed?: number;
  notes?: string;
}) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new RestaurantServiceError("你不是该圈子的有效成员。");

  const restaurant = await prisma.restaurant.create({
    data: {
      circleId: membership.circleId,
      createdById: input.userId,
      name: input.name,
      cuisine: input.cuisine || null,
      area: input.area || null,
      address: input.address || null,
      mapsUrl: input.mapsUrl || null,
      avgSpendAed: input.avgSpendAed,
      notes: input.notes || null,
    },
  });
  await writeAuditEvent(prisma, {
    actorId: input.userId,
    circleId: membership.circleId,
    eventType: "RESTAURANT_CREATED",
    entityType: "Restaurant",
    entityId: restaurant.id,
  });
  return restaurant;
}

export async function deleteRestaurant(input: { userId: string; slug: string; restaurantId: string }) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new RestaurantServiceError("你不是该圈子的有效成员。");
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: input.restaurantId, circleId: membership.circleId },
  });
  if (!restaurant) throw new RestaurantServiceError("餐厅不存在。");
  if (restaurant.createdById !== input.userId && !canManageCircle(membership.role)) {
    throw new RestaurantServiceError("只有推荐创建者或圈子管理员可删除。");
  }
  await prisma.restaurant.delete({ where: { id: restaurant.id } });
  await writeAuditEvent(prisma, {
    actorId: input.userId,
    circleId: membership.circleId,
    eventType: "RESTAURANT_DELETED",
    entityType: "Restaurant",
    entityId: restaurant.id,
  });
}

export async function updateRestaurant(input: {
  userId: string;
  slug: string;
  restaurantId: string;
  name: string;
  cuisine?: string;
  area?: string;
  address?: string;
  mapsUrl?: string;
  avgSpendAed?: number;
  notes?: string;
}) {
  const membership = await requireActiveMembership(input.userId, input.slug);
  if (!membership) throw new RestaurantServiceError("你不是该圈子的有效成员。");
  const restaurant = await prisma.restaurant.findFirst({ where: { id: input.restaurantId, circleId: membership.circleId } });
  if (!restaurant) throw new RestaurantServiceError("餐厅不存在。");
  if (restaurant.createdById !== input.userId && !canManageCircle(membership.role)) {
    throw new RestaurantServiceError("只有推荐创建者或圈子管理员可编辑。");
  }
  const updated = await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      name: input.name,
      cuisine: input.cuisine || null,
      area: input.area || null,
      address: input.address || null,
      mapsUrl: input.mapsUrl || null,
      avgSpendAed: input.avgSpendAed ?? null,
      notes: input.notes || null,
    },
  });
  await writeAuditEvent(prisma, { actorId: input.userId, circleId: membership.circleId, eventType: "RESTAURANT_UPDATED", entityType: "Restaurant", entityId: restaurant.id });
  return updated;
}
