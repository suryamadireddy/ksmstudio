import type { PortfolioVersion, RenderedSection } from "@/lib/types";
import { ARCHETYPE_REGISTRY } from "@/components/portfolio/archetypes";

export function ArchetypeBlock({
  version,
  section,
  index,
}: {
  version: PortfolioVersion;
  section: RenderedSection;
  index: number;
}) {
  const Component = ARCHETYPE_REGISTRY[section.archetype];
  if (!Component) return null;
  const presentation = version.presentation;
  const extraProps =
    section.archetype === "signature_slot"
      ? {
          library_component: presentation.signature_element?.library_component ?? null,
          fallback_items:
            version.character_card?.open_questions?.map((q: string, i: number) => ({
              label: String(i + 1),
              body: q,
            })) ?? [],
        }
      : {};
  return (
    <div data-section-index={index} className="portfolio-section-root">
      <Component {...(section.content as object)} {...extraProps} />
    </div>
  );
}

export function visibleSectionIndices(version: PortfolioVersion): { section: RenderedSection; index: number }[] {
  const pres = version.presentation?.sections ?? [];
  return (version.public_summary?.sections ?? [])
    .map((section, index) => ({ section, index }))
    .filter(({ section, index }) => {
      const slot = pres[index];
      if (slot?.hidden) return false;
      if (section.hidden) return false;
      return true;
    });
}
