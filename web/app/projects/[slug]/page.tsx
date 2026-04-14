import { redirect } from "next/navigation";

// The landing page FeaturedProjects links to /projects/[slug].
// KSM Studio uses idea IDs as slugs, so redirect to the idea detail page.
export default async function ProjectRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/ideas/${slug}`);
}
