import { ArchetypeBlock, visibleSectionIndices } from "./render-archetype-block";
import type { TemplateProps } from "./template-types";

export function CleanTemplate({ version, signaturePlacement: _placement }: TemplateProps) {
  void _placement;
  const { presentation } = version;
  const pairs = visibleSectionIndices(version);

  return (
    <article
      data-accent={presentation.accent_color}
      data-register={presentation.visual_register}
      data-template="clean"
      className="portfolio-page min-h-screen bg-[var(--bg)] text-[var(--fg)]"
    >
      <div className="mx-auto max-w-2xl space-y-24 px-6 py-32">
        {pairs.map(({ section, index }) => (
          <ArchetypeBlock key={index} version={version} section={section} index={index} />
        ))}
      </div>
    </article>
  );
}
