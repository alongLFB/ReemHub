"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

type Member = {
  id: string;
  displayName: string;
  image: string | null;
  building: string | null;
  bankName: string | null;
  phone?: string;
  iban?: string;
  birthday?: { month: number; day: number };
};

export function DirectoryCards({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.displayName, member.building, member.bankName]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [members, query]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(label + "已复制。");
  }

  return (
    <>
      <input className="mt-8 w-full max-w-md rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none focus:border-[var(--brand)]" onChange={(event) => setQuery(event.target.value)} placeholder="搜索称呼、楼宇或银行" value={query} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((member) => (
          <article className="rounded-3xl border border-[var(--line)] bg-white p-5" key={member.id}>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--brand-soft)] font-bold text-[var(--brand)]">{member.displayName.slice(0, 1)}</div>
              <div><h2 className="font-bold">{member.displayName}</h2><p className="text-sm text-[var(--muted)]">{member.building || "未公开楼宇"}</p></div>
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">{member.bankName || "未公开开户银行"}</p>
            {member.birthday && <p className="mt-2 text-sm text-[var(--muted)]">生日：{member.birthday.month} 月 {member.birthday.day} 日</p>}
            <div className="mt-5 flex gap-2">
              {member.phone && <button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold" onClick={() => copy("手机号", member.phone!)} type="button">复制手机号</button>}
              {member.iban && <button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold" onClick={() => copy("IBAN", member.iban!)} type="button">复制 IBAN</button>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
