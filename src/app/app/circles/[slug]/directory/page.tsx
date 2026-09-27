import Link from "next/link";
import { ProfileField } from "@prisma/client";
import { notFound } from "next/navigation";
import { decryptField } from "@/shared/security/field-encryption";
import { prisma } from "@/infrastructure/db/prisma";
import { requireActiveMembership } from "@/modules/circle/circle-access";
import { requireCurrentUserId } from "@/modules/identity/current-user";
import { DirectoryCards } from "./directory-cards";

function decrypt(value: string | null) {
  if (!value) return undefined;
  try {
    return decryptField(value);
  } catch {
    return undefined;
  }
}

export default async function DirectoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const viewerId = await requireCurrentUserId();
  const { slug } = await params;
  const viewerMembership = await requireActiveMembership(viewerId, slug);
  if (!viewerMembership) notFound();

  const memberships = await prisma.circleMembership.findMany({
    where: { circleId: viewerMembership.circleId, status: "ACTIVE" },
    include: {
      user: true,
      visibility: true,
    },
    orderBy: { approvedAt: "asc" },
  });

  const members = memberships.map((membership) => {
    const isSelf = membership.userId === viewerId;
    const fields = new Set(
      membership.visibility.filter((item) => item.isVisible).map((item) => item.field),
    );
    const visible = (field: ProfileField) => isSelf || fields.has(field);
    return {
      id: membership.id,
      displayName: visible(ProfileField.DISPLAY_NAME) ? membership.user.displayName || "圈友" : "圈友",
      image: visible(ProfileField.AVATAR) ? membership.user.image : null,
      building: visible(ProfileField.BUILDING) ? membership.user.building : null,
      bankName: visible(ProfileField.BANK_NAME) ? membership.user.bankName : null,
      phone: visible(ProfileField.PHONE) ? decrypt(membership.user.phoneCiphertext) : undefined,
      iban: visible(ProfileField.IBAN) ? decrypt(membership.user.ibanCiphertext) : undefined,
      birthday: visible(ProfileField.BIRTHDAY) && membership.user.birthdayMonth && membership.user.birthdayDay
        ? { month: membership.user.birthdayMonth, day: membership.user.birthdayDay }
        : undefined,
    };
  });

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10">
      <section className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-[var(--brand)]" href={"/app/circles/" + slug}>← {viewerMembership.circle.name}</Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">群友录</h1>
        <p className="mt-3 text-[var(--muted)]">只显示圈友主动对本圈公开的资料。IBAN 和手机号仅在所有者授权后提供复制。</p>
        <DirectoryCards members={members} />
      </section>
    </main>
  );
}
