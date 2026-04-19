import type { PortfolioVersion } from "@/lib/types";
import { ARCHETYPE_REGISTRY } from "./archetypes";

export function PortfolioRender({ version }: { version: PortfolioVersion }) {
  const { presentation, public_summary } = version;

  return (
    <article
      data-accent={presentation.accent_color}
      data-register={presentation.visual_register}
      className="portfolio-page"
      style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}
    >
      {public_summary.sections.map((section, idx) => {
        const Component = ARCHETYPE_REGISTRY[section.archetype];
        if (!Component) return null;
        const extraProps =
          section.archetype === "signature_slot"
            ? {
                library_component: presentation.signature_element?.library_component ?? null,
                fallback_items: version.character_card?.open_questions?.map(
                  (q: string, i: number) => ({ label: String(i + 1), body: q }),
                ) ?? [],
              }
            : {};
        return <Component key={idx} {...(section.content as object)} {...extraProps} />;
      })}
    </article>
  );
}
