import type { PublicProjectCard } from "@/lib/get-featured-public-projects";
import { Header } from "@/components/public/header";
import { FeaturedProjectsSection } from "@/components/public/featured-projects";
import { Hero } from "@/components/public/hero";
import { Process } from "@/components/public/process";
import { Closing } from "@/components/public/closing";

export function HomeShell({ projects }: { projects: PublicProjectCard[] }) {
  const hasProjects = projects.length > 0;
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <Header />
      {hasProjects ? (
        <FeaturedProjectsSection projects={projects} />
      ) : (
        <>
          <Hero />
          <Process />
          <Closing />
        </>
      )}
    </main>
  );
}
