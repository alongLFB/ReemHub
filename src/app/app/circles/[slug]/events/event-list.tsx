"use client";

import { useState } from "react";
import { toast } from "sonner";

type EventItem = {
  id: string;
  title: string;
  eventTime: string;
  locationName: string | null;
  restaurantName: string | null;
  maxParticipants: number | null;
  waitlistEnabled: boolean;
  status: string;
  creatorName: string;
  going: number;
  waiting: number;
  myStatus: string | null;
};

export function EventList({ slug, restaurants, initialEvents }: {
  slug: string;
  restaurants: { id: string; name: string }[];
  initialEvents: EventItem[];
}) {
  const [creating, setCreating] = useState(false);
  const [events] = useState(initialEvents);
  const [form, setForm] = useState({
    title: "",
    eventTime: "",
    locationName: "",
    restaurantId: "",
    maxParticipants: "",
    waitlistEnabled: false,
    registrationDeadline: "",
    reminderOffsets: "",
  });

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.eventTime) return toast.error("请选择活动时间。");
    const response = await fetch("/api/circles/" + slug + "/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        eventTime: new Date(form.eventTime).toISOString(),
        locationName: form.locationName || undefined,
        restaurantId: form.restaurantId || undefined,
        maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
        waitlistEnabled: form.waitlistEnabled,
        registrationDeadline: form.registrationDeadline ? new Date(form.registrationDeadline).toISOString() : undefined,
        reminderOffsets: form.reminderOffsets.split(/[,，]/).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0),
      }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "活动创建失败。");
    toast.success("活动已创建。");
    window.location.reload();
  }

  async function register(item: EventItem) {
    const method = item.myStatus ? "DELETE" : "POST";
    const response = await fetch("/api/circles/" + slug + "/events/" + item.id + "/registration", { method });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "操作失败。");
    toast.success(method === "POST" ? (body.status === "WAITLIST" ? "已加入候补名单。" : "报名成功。") : "报名已取消。");
    window.location.reload();
  }

  return (
    <div className="mt-8">
      <button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white" onClick={() => setCreating((value) => !value)} type="button">发起活动</button>
      {creating && <form className="mt-4 grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2" onSubmit={create}>
        <Input label="活动标题" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
        <Input label="活动时间" type="datetime-local" value={form.eventTime} onChange={(value) => setForm({ ...form, eventTime: value })} required />
        <Input label="自定义地点" value={form.locationName} onChange={(value) => setForm({ ...form, locationName: value })} />
        <label className="text-sm font-medium">关联餐厅<select className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3" onChange={(event) => setForm({ ...form, restaurantId: event.target.value })} value={form.restaurantId}><option value="">不关联</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
        <Input label="人数上限（留空则不限）" min={1} type="number" value={form.maxParticipants} onChange={(value) => setForm({ ...form, maxParticipants: value })} />
        <Input label="报名截止时间（可选）" type="datetime-local" value={form.registrationDeadline} onChange={(value) => setForm({ ...form, registrationDeadline: value })} />
        <Input label="提醒时间（距活动前分钟，逗号分隔）" value={form.reminderOffsets} onChange={(value) => setForm({ ...form, reminderOffsets: value })} />
        <label className="flex items-end gap-2 pb-3 text-sm font-medium"><input checked={form.waitlistEnabled} disabled={!form.maxParticipants} onChange={(event) => setForm({ ...form, waitlistEnabled: event.target.checked })} type="checkbox" />满员后开启候补名单</label>
        <button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white sm:col-span-2" type="submit">创建活动</button>
      </form>}
      <div className="mt-6 space-y-4">
        {events.map((event) => <article className="rounded-3xl border border-[var(--line)] bg-white p-5" key={event.id}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{event.title}</h2><p className="mt-2 text-sm text-[var(--muted)]">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.eventTime))}</p></div><button className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold" onClick={() => register(event)} type="button">{event.myStatus ? "取消报名" : "报名"}</button></div>
          <p className="mt-3 text-sm">{event.restaurantName || event.locationName || "地点待定"} · 发起人：{event.creatorName}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">已报名 {event.going}{event.maxParticipants ? "/" + event.maxParticipants : ""}{event.waitlistEnabled ? " · 候补 " + event.waiting : ""}</p>
        </article>)}
        {events.length === 0 && <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white p-10 text-center text-[var(--muted)]">还没有活动，发起一次约饭吧。</div>}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: number }) {
  return <label className="text-sm font-medium">{label}<input className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3" min={min} onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} /></label>;
}
