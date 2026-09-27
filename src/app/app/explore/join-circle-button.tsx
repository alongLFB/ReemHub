"use client";

import { useState } from "react";
import { toast } from "sonner";

export function JoinCircleButton({ slug, status }: { slug: string; status?: string }) {
  const [loading, setLoading] = useState(false);
  if (status === "ACTIVE") {
    return <p className="mt-5 text-sm font-semibold text-[var(--brand)]">你已加入</p>;
  }
  if (status === "PENDING") {
    return <p className="mt-5 text-sm font-semibold text-[var(--muted)]">申请审核中</p>;
  }

  async function join() {
    setLoading(true);
    const response = await fetch("/api/circles/" + slug + "/join", { method: "POST" });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      toast.error(body.error ?? "申请失败。");
      return;
    }
    toast.success("申请已提交，等待圈子管理员审批。");
    window.location.reload();
  }

  return <button className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} onClick={join}>{loading ? "提交中…" : "申请加入"}</button>;
}
