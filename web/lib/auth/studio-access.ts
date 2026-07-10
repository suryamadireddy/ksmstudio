import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isStudioOwner(user: Pick<User, "id" | "email"> | null | undefined): boolean {
  if (!user) return false;

  const allowedUserIds = parseAllowlist(process.env.STUDIO_OWNER_USER_IDS);
  const allowedEmails = parseAllowlist(process.env.STUDIO_OWNER_EMAILS);

  if (allowedUserIds.size === 0 && allowedEmails.size === 0) {
    return false;
  }

  return (
    allowedUserIds.has(user.id.toLowerCase()) ||
    (user.email ? allowedEmails.has(user.email.toLowerCase()) : false)
  );
}

export async function requireStudioOwner(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isStudioOwner(user)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, response: null };
}
