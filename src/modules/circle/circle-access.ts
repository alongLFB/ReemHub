import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";

export async function requireActiveMembership(userId: string, slug: string) {
  const membership = await prisma.circleMembership.findFirst({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      circle: { slug, status: "ACTIVE" },
    },
    include: { circle: true },
  });
  if (!membership) {
    return null;
  }
  return membership;
}

export function canManageCircle(role: MembershipRole) {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN;
}
