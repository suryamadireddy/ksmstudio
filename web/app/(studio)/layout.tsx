import { Playfair_Display, JetBrains_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudioNav from "./_components/StudioNav";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div
      className={`studio ${playfair.variable} ${jetbrains.variable} flex h-screen flex-col`}
      style={{ backgroundColor: "var(--studio-bg)", color: "var(--studio-fg)" }}
    >
      <StudioNav user={user} />
      <main className="flex-1 min-h-0 overflow-hidden px-6 py-10">{children}</main>
    </div>
  );
}
