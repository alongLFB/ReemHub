import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireCurrentUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user.id;
}

export async function getCurrentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}
