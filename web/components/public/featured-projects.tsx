"use client";

import Link from "next/link";
import { useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PublicProjectCard } from "@/lib/get-featured-public-projects";

const HEADER_PX = 72;
const INSET_PX = 8;
const COLLAPSED_RATIO = 0.1;
const MAX_FEATURED_TILES = 4;
const SECTION_SCROLL_BUDGET_VH = 320;
const PHASE_EXPAND_END = 0.2;
const PHASE_BROWSE_END = 0.7;

const TILE_W_MOBILE = 88;
const TILE_W_MD = 96;
const RAIL_COL_MOBILE = 112;
const RAIL_COL_MD = 128;

function getTileDescription(project: PublicProjectCard) {
  if (project.summary?.trim()) return project.summary.trim();
  if (project.rawIdea?.trim()) return project.rawIdea.trim();

  return "Research-backed product concept with a public case study, artifacts, and grounded product direction.";
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function FeaturedProjectsSection({
  projects,
}: {
  projects: PublicProjectCard[];
}) {
  const featuredProjects = projects.slice(0, MAX_FEATURED_TILES);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isMdUp, setIsMdUp] = useState(false);
  const [viewportH, setViewportH] = useState(900);
  const [progress, setProgress] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const read = () => {
      setIsMdUp(window.innerWidth >= 768);
      setViewportH(
        Math.max(
          window.innerHeight,
          window.visualViewport?.height ?? 0,
          document.documentElement.clientHeight,
        ),
      );
    };
    read();
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 135,
    damping: 34,
    mass: 0.26,
  });

  useMotionValueEvent(smoothProgress, "change", (latest) => {
    setProgress(clamp01(latest));
  });

  const expandProgress = clamp01(progress / PHASE_EXPAND_END);
  const browseProgress = clamp01(
    (progress - PHASE_EXPAND_END) / (PHASE_BROWSE_END - PHASE_EXPAND_END),
  );
  const shrinkProgress = clamp01((progress - PHASE_BROWSE_END) / (1 - PHASE_BROWSE_END));
  const inShrinkPhase = progress >= PHASE_BROWSE_END;

  const openProgress = inShrinkPhase ? 1 - shrinkProgress : expandProgress;
  const browseIndex = Math.min(
    featuredProjects.length - 1,
    Math.max(0, Math.floor(browseProgress * featuredProjects.length)),
  );

  const stickyHeightPx = Math.max(220, viewportH - HEADER_PX);
  const availableHeightPx = Math.max(140, stickyHeightPx - INSET_PX * 2);
  const collapsedHeightPx = Math.max(88, availableHeightPx * COLLAPSED_RATIO);

  if (featuredProjects.length === 0) {
    return (
      <section id="work" className="px-2 py-2 md:px-4">
        <div className="rounded-3xl border p-8 text-muted-foreground">
          No public projects yet.
        </div>
      </section>
    );
  }

  const displayIndex =
    openProgress > 0.985
      ? browseIndex
      : Math.min(selectedIndex, featuredProjects.length - 1);
  const displayProject = featuredProjects[displayIndex] ?? null;

  if (!displayProject) {
    return null;
  }

  const cardHeightPx = Math.round(
    lerp(collapsedHeightPx, availableHeightPx, openProgress),
  );
  const cardTopPx = inShrinkPhase
    ? INSET_PX
    : Math.max(INSET_PX, stickyHeightPx - INSET_PX - cardHeightPx);
  const cardContentOpen = openProgress > 0.85;
  const closingProgress = clamp01(
    (progress - PHASE_BROWSE_END) / (1 - PHASE_BROWSE_END),
  );
  const heroOpacity = clamp01(1 - expandProgress * 1.6 - closingProgress * 0.4);
  const closingOpacity = clamp01((closingProgress - 0.08) / 0.92);
  const heroSlideY = Math.round(lerp(0, -140, expandProgress));
  const closingSlideY = Math.round(lerp(140, 0, closingProgress));

  return (
    <section
      id="work"
      ref={sectionRef}
      aria-label="Featured projects"
      className="relative"
      style={{ height: `${SECTION_SCROLL_BUDGET_VH}vh` }}
    >
      <div
        className="sticky overflow-hidden bg-white"
        style={{
          top: `${HEADER_PX}px`,
          height: `${stickyHeightPx}px`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center px-6 md:px-8"
          style={{
            transform: `translateY(${heroSlideY}px)`,
            opacity: heroOpacity,
          }}
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground md:mb-6">
                AI Product Studio
              </p>
              <h1 className="font-serif text-3xl font-normal leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                Where ideas become research-backed products
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:mt-8 md:text-xl">
                Product strategy, AI-powered workflows, and design thinking -
                synthesized into PRDs, prototype directions, and interactive explainers.
              </p>
            </div>
          </div>
        </div>

        <div
          className="absolute left-2 right-2 z-20 overflow-hidden rounded-3xl bg-black"
          style={{
            top: `${cardTopPx}px`,
            height: `${cardHeightPx}px`,
          }}
        >
          <div
            className="grid h-full min-h-0 min-w-0 items-stretch gap-2 p-2.5 md:gap-4 md:p-4"
            style={{
              gridTemplateColumns: isMdUp
                ? `minmax(0, ${RAIL_COL_MD}px) minmax(0, 1fr)`
                : `minmax(0, ${RAIL_COL_MOBILE}px) minmax(0, 1fr)`,
              opacity: lerp(0.6, 1, openProgress),
            }}
          >
            <div className="flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden">
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 md:gap-4">
                {featuredProjects.map((project, index) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      if (cardContentOpen) {
                        setSelectedIndex(index);
                      }
                    }}
                    className={[
                      "aspect-square shrink-0 rounded-xl bg-white text-left md:rounded-2xl",
                      cardContentOpen ? "" : "pointer-events-none",
                      index === displayIndex
                        ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                        : "opacity-90",
                    ].join(" ")}
                    style={{
                      width: isMdUp ? TILE_W_MD : TILE_W_MOBILE,
                    }}
                    aria-pressed={index === displayIndex}
                    aria-label={`Select project ${project.title}`}
                  />
                ))}
              </div>
            </div>

            <Link
              href={`/projects/${displayProject.slug}`}
              className={[
                "flex h-full min-h-0 min-w-0 flex-col justify-between p-3 md:p-4",
                cardContentOpen
                  ? "overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  : "overflow-hidden",
              ].join(" ")}
            >
              <div className="min-w-0">
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400 md:mb-3">
                  Featured Project
                </p>
                <h3 className="max-w-[14ch] font-serif text-xl font-normal leading-tight tracking-tight text-white md:text-3xl lg:text-4xl">
                  {displayProject.title}
                </h3>
                <p
                  className={`mt-2 max-w-2xl text-xs leading-6 text-neutral-300 md:mt-3 md:text-sm md:leading-7 ${
                    cardContentOpen ? "" : "line-clamp-3"
                  }`}
                >
                  {getTileDescription(displayProject)}
                </p>
              </div>
              <div className="mt-3 flex min-w-0 items-center justify-between gap-3 pt-2 md:mt-4 md:pt-3">
                <span className="text-xs text-neutral-400 md:text-sm">
                  Explore the full case study
                </span>
                <span className="text-xs font-medium text-white md:text-sm">
                  Open Project →
                </span>
              </div>
            </Link>
          </div>
        </div>

        <div
          id="about"
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center px-6 py-24 md:py-32"
          style={{
            transform: `translateY(${closingSlideY}px)`,
            opacity: closingOpacity,
          }}
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Philosophy
              </p>
              <blockquote className="font-serif text-2xl font-normal leading-relaxed tracking-tight text-foreground md:text-3xl lg:text-4xl">
                Building thoughtful products with clarity, structure, and taste.
              </blockquote>
              <p className="mt-8 text-muted-foreground">
                Every project begins with deep understanding and ends with actionable direction -
                grounded in research, shaped by strategy, and refined through iteration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
