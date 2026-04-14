import type { PublicProjectCard } from "@/lib/get-featured-public-projects";
import { Header } from "@/components/public/header";
import { FeaturedProjectsSection } from "@/components/public/featured-projects";

export function HomeShell({ projects }: { projects: PublicProjectCard[] }) {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <FeaturedProjectsSection projects={projects} />
    </main>
  );
}
