import crypto from "node:crypto";
import { hash } from "argon2";
import { getServerEnv } from "@/config/env";
import { prisma } from "@/infrastructure/db/prisma";

const codeLifetimeMs = 10 * 60 * 1000;

function hashCode(email: string, purpose: string, code: string) {
  return crypto
    .createHmac("sha256", getServerEnv().AUTH_SECRET)
    .update([email, purpose, code].join(":"))
    .digest("hex");
}

function createCode() {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

export async function issueRegistrationCode(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const code = createCode();
  const expiresAt = new Date(Date.now() + codeLifetimeMs);
  const passwordHash = await hash(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationCode.updateMany({
      where: {
        email: input.email,
        purpose: "REGISTER",
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    await tx.emailVerificationCode.create({
      data: {
        email: input.email,
        purpose: "REGISTER",
        codeHash: hashCode(input.email, "REGISTER", code),
        expiresAt,
        pendingDisplayName: input.displayName,
        pendingPasswordHash: passwordHash,
      },
    });
  });

  return { code, expiresAt };
}

export async function consumeRegistrationCode(input: {
  email: string;
  code: string;
}) {
  const codeHash = hashCode(input.email, "REGISTER", input.code);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerificationCode.findFirst({
      where: {
        email: input.email,
        purpose: "REGISTER",
        codeHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record?.pendingDisplayName || !record.pendingPasswordHash) {
      return null;
    }

    const existing = await tx.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new Error("EMAIL_ALREADY_REGISTERED");
    }

    const user = await tx.user.create({
      data: {
        email: input.email,
        emailVerified: now,
        displayName: record.pendingDisplayName,
        name: record.pendingDisplayName,
        passwordHash: record.pendingPasswordHash,
        notificationPreference: {
          create: {},
        },
      },
      select: { id: true, email: true, displayName: true },
    });

    await tx.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });

    return user;
  });
}
