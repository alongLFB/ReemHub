import Link from "next/link";
import { notFound } from "next/navigation";
import { decryptField } from "@/shared/security/field-encryption";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { CircleProfileForm } from "./profile-form";

function safelyDecrypt(value: string | null) {
  if (!value) return "";
  try {
    return decryptField(value);
  } catch {
    return "";
  }
}

export default async function CircleProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireCurrentUserId();
  const { slug } = await params;
  const membership = await requireActiveMembership(userId, slug);
  if (!membership) notFound();

  const [user, visibility] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.membershipProfileVisibility.findMany({ where: { membershipId: membership.id } }),
  ]);

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-2xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href={"/app/circles/" + slug}>← {membership.circle.name}</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">我的资料与可见性</h1>
        <p className="mt-3 text-[var(--muted)]">资料保存到你的账户；哪些字段能被该圈子成员看到，由你在这里单独决定。</p>
        <CircleProfileForm
          initialProfile={{
            displayName: user.displayName,
            building: user.building ?? "",
            phone: safelyDecrypt(user.phoneCiphertext),
            bankName: user.bankName ?? "",
            iban: safelyDecrypt(user.ibanCiphertext),
            birthdayMonth: user.birthdayMonth,
            birthdayDay: user.birthdayDay,
          }}
          initialVisibleFields={visibility.filter((item) => item.isVisible).map((item) => item.field)}
          slug={slug}
        />
      </section>
    </main>
  );
}
