import { NextResponse } from "next/server";
import { deleteRestaurant, RestaurantServiceError, updateRestaurant } from "@/modules/restaurant/restaurant-service";
import { getCurrentUserId } from "@/modules/identity/current-user";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(180),
  cuisine: z.string().trim().max(120).optional(),
  area: z.string().trim().max(120).optional(),
  address: z.string().trim().max(1000).optional(),
  mapsUrl: z.string().url().max(2048).optional().or(z.literal("")),
  avgSpendAed: z.number().nonnegative().max(1000000).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function PUT(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "餐厅资料格式不正确。" }, { status: 400 });
  try {
    const { slug, id } = await context.params;
    const restaurant = await updateRestaurant({ userId, slug, restaurantId: id, ...parsed.data });
    return NextResponse.json(restaurant);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RestaurantServiceError ? error.message : "编辑失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const { slug, id } = await context.params;
    await deleteRestaurant({ userId, slug, restaurantId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RestaurantServiceError ? error.message : "删除失败。" }, { status: 400 });
  }
}
