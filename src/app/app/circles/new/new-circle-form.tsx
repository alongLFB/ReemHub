"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function NewCircleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/circles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        visibility,
        tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      toast.error(body.error ?? "圈子创建失败。");
      return;
    }
    toast.success("圈子已创建。");
    router.push("/app/circles/" + body.slug);
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5 rounded-3xl border border-[var(--line)] bg-white p-6" onSubmit={submit}>
      <label className="block text-sm font-medium">圈子名称
        <input className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3 outline-none focus:border-[var(--brand)]" maxLength={120} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
      </label>
      <label className="block text-sm font-medium">简介
        <textarea className="mt-2 min-h-28 w-full rounded-xl border border-[var(--line)] px-3 py-3 outline-none focus:border-[var(--brand)]" maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="这是一个怎样的圈子？" value={description} />
      </label>
      <label className="block text-sm font-medium">标签（用逗号分隔，最多 5 个）
        <input className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3 outline-none focus:border-[var(--brand)]" onChange={(event) => setTags(event.target.value)} placeholder="UAE, 约饭, 亲子" value={tags} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">可见性</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button className={"rounded-2xl border p-4 text-left " + (visibility === "PRIVATE" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]")} onClick={() => setVisibility("PRIVATE")} type="button">
            <strong className="block">私密圈子</strong><span className="mt-1 block text-xs text-[var(--muted)]">仅通过邀请链接或邀请码发起申请。</span>
          </button>
          <button className={"rounded-2xl border p-4 text-left " + (visibility === "PUBLIC" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]")} onClick={() => setVisibility("PUBLIC")} type="button">
            <strong className="block">公开圈子</strong><span className="mt-1 block text-xs text-[var(--muted)]">可在广场被发现，内容仍需审批后查看。</span>
          </button>
        </div>
      </fieldset>
      <button className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? "创建中…" : "创建圈子"}</button>
    </form>
  );
}
