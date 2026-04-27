import type { RenderedSection } from "@/lib/types";
import { ArchetypeBlock, visibleSectionIndices } from "./render-archetype-block";
import type { TemplateProps } from "./template-types";

function isSignatureSection(section: RenderedSection): boolean {
  return section.archetype === "signature_slot";
}

export function ShowcaseTemplate({ version, signaturePlacement }: TemplateProps) {
  const { presentation } = version;
  const side = signaturePlacement.side ?? "right";
  const sigIdx = presentation.signature_element?.placement ?? -1;
  const pairs = visibleSectionIndices(version);

  const signaturePair = pairs.find(({ section, index }) => index === sigIdx && isSignatureSection(section));
  const before = pairs.filter(({ index }) => index < sigIdx);
  const after = pairs.filter(({ index }) => index > sigIdx);

  if (!signaturePair || sigIdx < 0) {
    return (
      <article
        data-accent={presentation.accent_color}
        data-register={presentation.visual_register}
        data-template="showcase"
        className="portfolio-page min-h-screen bg-[var(--bg)] text-[var(--fg)]"
      >
        <div className="mx-auto max-w-3xl space-y-16 px-6 py-16 [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
          {pairs.map(({ section, index }) => (
            <ArchetypeBlock key={index} version={version} section={section} index={index} />
          ))}
        </div>
      </article>
    );
  }

  const beforeBlocks = before.map(({ section, index }) => (
    <ArchetypeBlock key={index} version={version} section={section} index={index} />
  ));
  const afterBlocks = after.map(({ section, index }) => (
    <ArchetypeBlock key={index} version={version} section={section} index={index} />
  ));

  const signatureEl = (
    <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:self-start lg:max-w-sm [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
      <ArchetypeBlock
        version={version}
        section={signaturePair.section}
        index={signaturePair.index}
      />
    </aside>
  );

  const contentEl = (
    <div className="mx-auto min-w-0 max-w-xl space-y-16 [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
      {beforeBlocks}
    </div>
  );

  const gridClass =
    side === "right"
      ? "grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] lg:items-start lg:gap-x-14"
      : "grid gap-12 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:items-start lg:gap-x-14";

  return (
    <article
      data-accent={presentation.accent_color}
      data-register={presentation.visual_register}
      data-template="showcase"
      className="portfolio-page min-h-screen bg-[var(--bg)] text-[var(--fg)]"
    >
      <div className="mx-auto max-w-6xl px-6 py-16 [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
        <div className={gridClass}>
          {side === "right" ? (
            <>
              <div className="order-2 min-w-0 lg:order-1">{contentEl}</div>
              <div className="order-1 lg:order-2">{signatureEl}</div>
            </>
          ) : (
            <>
              {signatureEl}
              <div className="min-w-0">{contentEl}</div>
            </>
          )}
        </div>
        {after.length > 0 && (
          <div className="mx-auto mt-20 w-full max-w-3xl space-y-20 border-t border-[var(--border)] pt-20 [[data-workspace-preview]_&]:max-w-none [[data-workspace-preview]_&]:w-full">
            {afterBlocks}
          </div>
        )}
      </div>
    </article>
  );
}
