import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicProjectCard } from "@/lib/get-featured-public-projects";

export function ProjectCard({
  project,
  index = 0,
}: {
  project: PublicProjectCard;
  index?: number;
}) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group block opacity-0 fade-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted">
        <Image
          src={project.coverImage}
          alt={project.title}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />

        <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/40" />

        <div className="absolute inset-0 flex flex-col justify-between p-6 text-white">
          <div>
            <h2 className="max-w-[85%] text-2xl font-medium leading-tight">
              {project.title}
            </h2>

            <p className="mt-4 max-w-[85%] line-clamp-4 text-sm leading-6 text-white/85 opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
              {project.summary ??
                project.rawIdea ??
                "A structured product exploration developed through research and product thinking."}
            </p>
          </div>

          <div className="flex justify-end">
            <ArrowRight className="h-5 w-5 opacity-0 translate-y-1 transition-all duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0 group-hover:opacity-100" />
          </div>
        </div>
      </div>
    </Link>
  );
}
