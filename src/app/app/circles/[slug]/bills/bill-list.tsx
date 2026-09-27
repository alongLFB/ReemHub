"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Member = { id: string; name: string };
type Bill = { id: string; title: string; status: string; creatorName: string; creatorId: string; participantCount: number; expenseTotalAed: number; transferCount: number };

export function BillList({ slug, members, events, bills, currentUserId }: { slug: string; members: Member[]; events: { id: string; title: string }[]; bills: Bill[]; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>(members.map((member) => member.id));
  const [guests, setGuests] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/circles/${slug}/bills`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, eventId: eventId || undefined, memberIds, guestNames: guests.split(/[,，\n]/).map((name) => name.trim()).filter(Boolean) }) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "创建账单失败。");
    toast.success("账单已创建。"); router.push(`/app/circles/${slug}/bills/${body.id}`);
  }
  return <div className="mt-8"><button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white" type="button" onClick={() => setOpen(!open)}>新建 AA 账单</button>
    {open && <form className="mt-4 space-y-4 rounded-3xl border border-[var(--line)] bg-white p-5" onSubmit={create}>
      <label className="block text-sm font-medium">账单标题<input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3" placeholder="周末晚餐" /></label>
      <label className="block text-sm font-medium">关联活动（可选）<select value={eventId} onChange={(event) => setEventId(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3"><option value="">不关联活动</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <fieldset><legend className="text-sm font-medium">圈内参与者</legend><div className="mt-2 flex flex-wrap gap-2">{members.map((member) => <label key={member.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><input className="mr-2" checked={memberIds.includes(member.id)} type="checkbox" onChange={() => setMemberIds((ids) => ids.includes(member.id) ? ids.filter((id) => id !== member.id) : [...ids, member.id])} />{member.name}</label>)}</div></fieldset>
      <label className="block text-sm font-medium">临时 Guest（逗号或换行分隔）<textarea value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-[var(--line)] px-3 py-3" /></label><button className="rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white">创建并录入支出</button>
    </form>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{bills.map((bill) => <Link key={bill.id} href={`/app/circles/${slug}/bills/${bill.id}`} className="rounded-3xl border border-[var(--line)] bg-white p-5"><div className="flex justify-between gap-3"><h2 className="text-xl font-bold">{bill.title}</h2><span className="text-xs font-semibold text-[var(--brand)]">{bill.status}</span></div><p className="mt-3 text-sm text-[var(--muted)]">{bill.participantCount} 人 · 支出 AED {bill.expenseTotalAed.toFixed(2)} · {bill.transferCount} 笔转账</p><p className="mt-2 text-xs text-[var(--muted)]">创建者：{bill.creatorName}{bill.creatorId === currentUserId ? "（我）" : ""}</p></Link>)}</div>
  </div>;
}
