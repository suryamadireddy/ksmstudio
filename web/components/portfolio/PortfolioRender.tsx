import type { PortfolioVersion } from "@/lib/types";
import { ARCHETYPE_REGISTRY } from "./archetypes";

export function PortfolioRender({ version }: { version: PortfolioVersion }) {
  const { presentation, public_summary } = version;
  const sections = Array.isArray(public_summary?.sections) ? public_summary.sections : [];

  return (
    <article
      data-accent={presentation?.accent_color ?? "amber"}
      data-register={presentation?.visual_register ?? "editorial"}
      className="portfolio-page"
      style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}
    >
      {sections.map((section, idx) => {
        const Component = ARCHETYPE_REGISTRY[section.archetype];
        if (!Component) return null;
        const sectionContent =
          section.content && typeof section.content === "object"
            ? (section.content as object)
            : {};
        const extraProps =
          section.archetype === "signature_slot"
            ? {
                library_component: presentation?.signature_element?.library_component ?? null,
                fallback_items: Array.isArray(version.character_card?.open_questions)
                  ? version.character_card.open_questions.map(
                      (q: string, i: number) => ({ label: String(i + 1), body: q }),
                    )
                  : [],
              }
            : {};
        return <Component key={idx} {...sectionContent} {...extraProps} />;
      })}
    </article>
  );
}
