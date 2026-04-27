import type { RenderedSection } from "@/lib/types";
import { ArchetypeBlock, visibleSectionIndices } from "./render-archetype-block";
import type { TemplateProps } from "./template-types";

function isSignatureSection(section: RenderedSection): boolean {
  return section.archetype === "signature_slot";
}

export function AestheticTemplate({ version, signaturePlacement }: TemplateProps) {
  const { presentation } = version;
  const pairs = visibleSectionIndices(version);
  const sigIdx = presentation.signature_element?.placement ?? -1;
  const sigPair = pairs.find(({ section, index }) => index === sigIdx && isSignatureSection(section));

  const heroMode = signaturePlacement.mode === "fixed_hero";
  const first = pairs[0];
  const heroSignature =
    heroMode && sigPair && first && sigPair.index !== first.index ? sigPair : null;

  const heroIndices = new Set<number>();
  if (first) heroIndices.add(first.index);
  if (heroSignature) heroIndices.add(heroSignature.index);
  if (heroMode && sigPair && !first) heroIndices.add(sigPair.index);

  const gridPairs = pairs.filter(({ index }) => !heroIndices.has(index));

  return (
    <article
      data-accent={presentation.accent_color}
      data-register={presentation.visual_register}
      data-template="aesthetic"
      className="portfolio-page min-h-screen bg-[var(--bg)] text-[var(--fg)]"
    >
      {(first || (heroMode && sigPair)) && (
        <header className="flex min-h-screen flex-col justify-center gap-16 px-6 py-24 md:px-12">
          {first && (
            <div className="mx-auto max-w-4xl text-center font-serif text-4xl leading-tight tracking-tight text-balance md:text-7xl md:leading-[1.05] [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
              <ArchetypeBlock version={version} section={first.section} index={first.index} />
            </div>
          )}
          {heroSignature && (
            <div className="mx-auto w-full max-w-3xl [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
              <ArchetypeBlock
                version={version}
                section={heroSignature.section}
                index={heroSignature.index}
              />
            </div>
          )}
          {heroMode && sigPair && !first && (
            <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
              <ArchetypeBlock version={version} section={sigPair.section} index={sigPair.index} />
            </div>
          )}
        </header>
      )}

      <div className="mx-auto max-w-6xl space-y-24 px-6 py-24 md:px-10 [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
        {gridPairs.map(({ section, index }, i) => (
          <div
            key={index}
            className={
              i % 3 === 0
                ? "w-full"
                : i % 3 === 1
                  ? "mx-auto w-full max-w-4xl md:ml-0 md:w-2/3 [[data-workspace-preview]_&]:max-w-none"
                  : "mx-auto w-full max-w-2xl md:mr-0 md:ml-auto md:w-2/3 [[data-workspace-preview]_&]:max-w-none"
            }
          >
            <ArchetypeBlock version={version} section={section} index={index} />
          </div>
        ))}
      </div>
    </article>
  );
}
