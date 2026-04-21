# Landing Page Audit

## 1. web/app/page.tsx

```tsx
import { getFeaturedPublicProjects } from "@/lib/get-featured-public-projects";
import { HomeShell } from "@/components/public/home-shell";

export default async function HomePage() {
  const projects = await getFeaturedPublicProjects();

  return <HomeShell projects={projects} />;
}
```

---

## 2. web/app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KSM Studio",
  description: "Idea evaluation pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

---

## 3. web/components/public/home-shell.tsx

```tsx
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
```

---

## 4. web/components/public/featured-projects.tsx

```tsx
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
  const [mounted, setMounted] = useState(false);
  const [isMdUp, setIsMdUp] = useState(false);
  const [viewportH, setViewportH] = useState(900);
  const [progress, setProgress] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    target: mounted ? sectionRef : undefined,
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
    return null;
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
```

---

## 5. web/components/public/header.tsx

```tsx
"use client";

import Link from "next/link";

export function Header() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="h-[72px] px-8 md:px-10">
        <div className="flex h-full items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium tracking-tight text-neutral-900"
          >
            KSM Studio
          </Link>

          <div className="flex h-full items-center gap-8">
            <Link
              href="/projects"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              Projects
            </Link>
            <Link
              href="/process"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              Process
            </Link>
            <Link
              href="/#about"
              className="text-sm text-neutral-700 hover:text-neutral-900"
            >
              About
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
```

---

## 6. web/components/public/hero.tsx

```tsx
export function Hero() {
  return (
    <section className="relative flex h-[calc(100svh-4.5rem-10svh)] min-h-[26rem] flex-col justify-center px-6 pt-8 md:px-8 md:pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground md:mb-6">
            AI Product Studio
          </p>

          <h1 className="font-serif text-3xl font-normal leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Where ideas become research-backed products
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:mt-8 md:text-xl">
            Product strategy, AI-powered workflows, and design thinking —
            synthesized into PRDs, prototype directions, and interactive explainers.
          </p>
        </div>
      </div>
    </section>
  );
}
```

---

## 7. web/components/public/closing.tsx

```tsx
export function Closing() {
  return (
    <section
      id="about"
      className="flex min-h-[calc(100svh-4.5rem-10svh)] items-center px-6 py-24 md:py-32"
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
    </section>
  )
}
```

---

## 8. web/components/public/process.tsx

```tsx
const processSteps = [
    {
        number: "01",
        title: "Idea",
        description: "Initial concept exploration and problem framing",
    },
    {
        number: "02",
        title: "Brief",
        description: "Structured project definition and scope alignment",
    },
    {
        number: "03",
        title: "Synthesis",
        description: "Research consolidation and insight extraction",
    },
    {
        number: "04",
        title: "PRD",
        description: "Product requirements with rationale and constraints",
    },
    {
        number: "05",
        title: "Prototype",
        description: "Interactive explorations and grounded conversations",
    },
]

export function Process() {
    return (
        <section id="process" className="bg-secondary/50 px-6 py-24 md:py-32">
            <div className="mx-auto max-w-6xl">
                <div className="mb-16">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        How We Work
                    </p>
                    <h2 className="max-w-2xl font-serif text-3xl font-normal tracking-tight text-foreground md:text-4xl">
                        A structured approach to product thinking
                    </h2>
                </div>

                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
                    {processSteps.map((step) => (
                        <div
                            key={step.number}
                            className="flex flex-col bg-card p-6 transition-colors hover:bg-secondary/80"
                        >
                            <span className="mb-4 text-xs font-medium text-accent">
                                {step.number}
                            </span>
                            <h3 className="mb-2 font-serif text-lg font-normal tracking-tight text-foreground">
                                {step.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {step.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
```

---

## 9. web/lib/get-featured-public-projects.ts

```typescript
export type PublicProjectCard = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  rawIdea?: string | null;
  coverImage: string;
};

export async function getFeaturedPublicProjects(): Promise<PublicProjectCard[]> {
  return [];
}
```

---

## 10. web/package.json (dependencies only)

```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.88.0",
  "@supabase/ssr": "^0.10.2",
  "@supabase/supabase-js": "^2.103.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "date-fns": "^4.1.0",
  "eslint": "^9.39.4",
  "eslint-config-next": "^16.2.3",
  "framer-motion": "^12.38.0",
  "lucide-react": "^1.8.0",
  "next": "16.2.3",
  "radix-ui": "^1.4.3",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "react-markdown": "^10.1.0",
  "shadcn": "^4.2.0",
  "tailwind-merge": "^3.5.0",
  "tw-animate-css": "^1.4.0",
  "zod": "^4.3.6"
},
"devDependencies": {
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

---

## grep -rn "useScroll\|useTransform\|motion\." web/components/public/ web/app/

```
components/public/featured-projects.tsx:4:import { useMotionValueEvent, useScroll, useSpring } from "framer-motion";
components/public/featured-projects.tsx:73:  const { scrollYProgress } = useScroll({
```
