"use client";

import { ProfileField } from "@prisma/client";
import { useState } from "react";
import { toast } from "sonner";

const fields: { key: ProfileField; label: string }[] = [
  { key: "DISPLAY_NAME", label: "显示名称" },
  { key: "AVATAR", label: "头像" },
  { key: "BUILDING", label: "楼宇" },
  { key: "PHONE", label: "手机号" },
  { key: "BANK_NAME", label: "开户银行" },
  { key: "IBAN", label: "IBAN" },
  { key: "BIRTHDAY", label: "生日（月/日）" },
];

export function CircleProfileForm({
  slug,
  initialProfile,
  initialVisibleFields,
}: {
  slug: string;
  initialProfile: {
    displayName: string;
    building: string;
    phone: string;
    bankName: string;
    iban: string;
    birthdayMonth: number | null;
    birthdayDay: number | null;
  };
  initialVisibleFields: ProfileField[];
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [visible, setVisible] = useState<ProfileField[]>(initialVisibleFields);
  const [saving, setSaving] = useState(false);

  function update(key: keyof typeof profile, value: string) {
    setProfile((current) => ({
      ...current,
      [key]: key === "birthdayMonth" || key === "birthdayDay" ? (value ? Number(value) : null) : value,
    }));
  }

  function toggle(field: ProfileField) {
    setVisible((current) => current.includes(field) ? current.filter((value) => value !== field) : [...current, field]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const [profileResponse, visibilityResponse] = await Promise.all([
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      }),
      fetch("/api/circles/" + slug + "/profile-visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibleFields: visible }),
      }),
    ]);
    setSaving(false);
    if (!profileResponse.ok || !visibilityResponse.ok) {
      const response = !profileResponse.ok ? profileResponse : visibilityResponse;
      const body = await response.json();
      toast.error(body.error ?? "保存失败。");
      return;
    }
    toast.success("资料与可见性已保存。");
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={save}>
      <section className="grid gap-4 rounded-3xl border border-[var(--line)] bg-white p-6 sm:grid-cols-2">
        <Input label="显示名称" required value={profile.displayName} onChange={(value) => update("displayName", value)} />
        <Input label="楼宇" value={profile.building} onChange={(value) => update("building", value)} />
        <Input label="手机号" value={profile.phone} onChange={(value) => update("phone", value)} />
        <Input label="开户银行" value={profile.bankName} onChange={(value) => update("bankName", value)} />
        <Input label="IBAN" value={profile.iban} onChange={(value) => update("iban", value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="生日月" max={12} min={1} type="number" value={profile.birthdayMonth?.toString() ?? ""} onChange={(value) => update("birthdayMonth", value)} />
          <Input label="生日日" max={31} min={1} type="number" value={profile.birthdayDay?.toString() ?? ""} onChange={(value) => update("birthdayDay", value)} />
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--line)] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">在“{slug}”中公开什么？</h2><p className="mt-1 text-sm text-[var(--muted)]">仅已批准成员能看到你勾选的字段。</p></div>
          <button className="rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm font-semibold text-[var(--brand)]" onClick={() => setVisible(Object.values(ProfileField))} type="button">全部公开</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3" key={field.key}>
              <span>{field.label}</span>
              <input checked={visible.includes(field.key)} onChange={() => toggle(field.key)} type="checkbox" />
            </label>
          ))}
        </div>
      </section>
      <button className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "保存中…" : "保存资料与可见性"}</button>
    </form>
  );
}

function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block text-sm font-medium">{label}<input className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-3 outline-none focus:border-[var(--brand)]" onChange={(event) => onChange(event.target.value)} value={value} {...props} /></label>;
}
