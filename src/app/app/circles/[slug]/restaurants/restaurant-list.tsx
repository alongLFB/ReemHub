"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

type Restaurant = {
  id: string;
  name: string;
  cuisine: string | null;
  area: string | null;
  mapsUrl: string | null;
  avgSpendAed: string | null;
  notes: string | null;
  creatorName: string;
  createdById: string;
};

export function RestaurantList({ slug, initialRestaurants, currentUserId, canManage }: {
  slug: string;
  initialRestaurants: Restaurant[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", cuisine: "", area: "", mapsUrl: "", avgSpendAed: "", notes: "" });
  const visible = useMemo(() => restaurants.filter((item) => [item.name, item.cuisine, item.area].filter(Boolean).some((value) => value?.toLowerCase().includes(query.toLowerCase()))), [query, restaurants]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/circles/" + slug + "/restaurants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        avgSpendAed: form.avgSpendAed ? Number(form.avgSpendAed) : undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "创建失败。");
    toast.success("餐厅推荐已发布。");
    window.location.reload();
  }

  async function remove(id: string) {
    const response = await fetch("/api/circles/" + slug + "/restaurants/" + id, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "删除失败。");
    setRestaurants((items) => items.filter((item) => item.id !== id));
    toast.success("餐厅推荐已删除。");
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-3">
        <input className="flex-1 rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none focus:border-[var(--brand)]" onChange={(event) => setQuery(event.target.value)} placeholder="按名称、菜系或区域筛选" value={query} />
        <button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white" onClick={() => setCreating((value) => !value)} type="button">推荐餐厅</button>
      </div>
      {creating && <form className="mt-4 grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2" onSubmit={create}>
        <Input label="名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Input label="菜系" value={form.cuisine} onChange={(value) => setForm({ ...form, cuisine: value })} />
        <Input label="区域" value={form.area} onChange={(value) => setForm({ ...form, area: value })} />
        <Input label="人均 AED" type="number" value={form.avgSpendAed} onChange={(value) => setForm({ ...form, avgSpendAed: value })} />
        <Input label="Google Maps 链接" value={form.mapsUrl} onChange={(value) => setForm({ ...form, mapsUrl: value })} />
        <Input label="推荐提示" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white sm:col-span-2" type="submit">立即发布</button>
      </form>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((restaurant) => <article className="rounded-3xl border border-[var(--line)] bg-white p-5" key={restaurant.id}>
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{restaurant.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{[restaurant.cuisine, restaurant.area].filter(Boolean).join(" · ") || "未分类"}</p></div>{(canManage || restaurant.createdById === currentUserId) && <button className="text-sm font-semibold text-red-700" onClick={() => remove(restaurant.id)} type="button">删除</button>}</div>
          {restaurant.avgSpendAed && <p className="mt-3 text-sm">人均 AED {restaurant.avgSpendAed}</p>}
          {restaurant.notes && <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{restaurant.notes}</p>}
          <p className="mt-4 text-xs text-[var(--muted)]">推荐人：{restaurant.creatorName}</p>
          {restaurant.mapsUrl && <a className="mt-3 inline-block text-sm font-semibold text-[var(--brand)]" href={restaurant.mapsUrl} rel="noreferrer" target="_blank">打开地图 ↗</a>}
        </article>)}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="text-sm font-medium">{label}<input className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3" onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} /></label>;
}
