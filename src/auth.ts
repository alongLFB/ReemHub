import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify } from "argon2";
import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { prisma } from "@/infrastructure/db/prisma";
import { writeAuditEvent } from "@/modules/audit/write-audit-event";
import { clientAddress, consumeRateLimit } from "@/shared/security/rate-limit";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(256),
});

const env = getServerEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const limit = consumeRateLimit(
          ["login:", clientAddress(request.headers), ":", parsed.data.email].join(""),
          10,
          15 * 60 * 1000,
        );
        if (!limit.allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            displayName: true,
            image: true,
            passwordHash: true,
            emailVerified: true,
            authVersion: true,
            status: true,
          },
        });

        if (
          !user ||
          user.status !== "ACTIVE" ||
          !user.emailVerified ||
          !user.passwordHash ||
          !(await verify(user.passwordHash, parsed.data.password).catch(() => false))
        ) {
          await writeAuditEvent(prisma, {
            eventType: "LOGIN_FAILED",
            entityType: "Authentication",
            entityId: parsed.data.email,
            metadata: { reason: "invalid_credentials" },
          });
          return null;
        }

        await writeAuditEvent(prisma, {
          actorId: user.id,
          eventType: "LOGIN_SUCCEEDED",
          entityType: "Authentication",
          entityId: user.id,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: user.image,
          authVersion: user.authVersion,
        };
      },
    }),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.email) {
        const profileName =
          typeof profile?.name === "string" && profile.name.trim()
            ? profile.name.trim()
            : undefined;
        // In the OAuth signIn callback, `user.id` can be the provider's subject
        // (Google `sub`) rather than the UUID persisted by the Prisma adapter.
        const persistedUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (persistedUser) {
          if (profileName) {
            await prisma.user.updateMany({
              where: { id: persistedUser.id, displayName: "" },
              data: { displayName: profileName },
            });
          }
          // Audit availability must not deny an otherwise valid OAuth login.
          await writeAuditEvent(prisma, {
            actorId: persistedUser.id,
            eventType: "GOOGLE_LOGIN_SUCCEEDED",
            entityType: "Authentication",
            entityId: persistedUser.id,
          }).catch(() => undefined);
        }
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.authVersion = user.authVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = typeof token.userId === "string" ? token.userId : token.sub;
      if (!userId) {
        return session;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, authVersion: true, status: true },
      });
      if (!user || user.status !== "ACTIVE" || user.authVersion !== token.authVersion) {
        return session;
      }

      session.user.id = user.id;
      session.user.authVersion = user.authVersion;
      return session;
    },
  },
});
