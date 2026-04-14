import { getFeaturedPublicProjects } from "@/lib/get-featured-public-projects";
import { HomeShell } from "@/components/public/home-shell";

export default async function HomePage() {
  const projects = await getFeaturedPublicProjects();

  return <HomeShell projects={projects} />;
}
