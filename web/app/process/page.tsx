import type { Metadata } from "next";
import { Header } from "@/components/public/header";
import { Process } from "@/components/public/process";

export const metadata: Metadata = {
  title: "Process | KSM Studio",
  description:
    "A structured view into how KSM Studio approaches product thinking from idea framing to prototype.",
};

export default function ProcessPage() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Process />
    </main>
  );
}
