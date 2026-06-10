import { SignatureDispatcher } from "@/components/portfolio/signatures";

export interface SignatureSlotContent {
  intro?: string;
  // Injected by PortfolioRender
  library_component?: string | null;
  fallback_items?: { label: string; body: string }[];
}

export function SignatureSlot({ intro, library_component, fallback_items }: SignatureSlotContent) {
  if (library_component != null && typeof library_component !== "string") {
    return null;
  }
  if (fallback_items != null && !Array.isArray(fallback_items)) {
    return null;
  }

  return (
    <section data-signature-slot className="py-16 md:py-32">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        {intro && (
          <p className="mb-8 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            {intro}
          </p>
        )}
        {library_component ? (
          <SignatureDispatcher
            component={library_component}
            items={fallback_items}
          />
        ) : (
          <div
            id="signature-slot"
            className="flex min-h-48 items-center justify-center rounded-sm border"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            <span className="text-xs">signature component pending</span>
          </div>
        )}
      </div>
    </section>
  );
}
