import { NextResponse } from "next/server";
import { z } from "zod";
import { createRestaurant, RestaurantServiceError } from "@/modules/restaurant/restaurant-service";
import { getCurrentUserId } from "@/modules/identity/current-user";

const schema = z.object({
  name: z.string().trim().min(1).max(180),
  cuisine: z.string().trim().max(120).optional(),
  area: z.string().trim().max(120).optional(),
  address: z.string().trim().max(1000).optional(),
  mapsUrl: z.string().url().optional().or(z.literal("")),
  avgSpendAed: z.number().positive().max(100_000).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "餐厅资料格式不正确。" }, { status: 400 });

  try {
    const { slug } = await context.params;
    const restaurant = await createRestaurant({
      userId,
      slug,
      ...parsed.data,
      mapsUrl: parsed.data.mapsUrl || undefined,
    });
    return NextResponse.json({ id: restaurant.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RestaurantServiceError ? error.message : "创建失败。" }, { status: 400 });
  }
}
