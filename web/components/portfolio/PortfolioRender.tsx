import type { LayoutTemplate, PortfolioVersion, SignaturePlacement } from "@/lib/types";
import { EditLayer } from "./EditLayer";
import { CleanTemplate, TEMPLATE_REGISTRY } from "./templates";

export function PortfolioRender({
  version,
  editMode,
  onSignatureMove,
  onSignaturePlacementDraft,
  onPlacementCancel,
  placementMode,
  signaturePlacementOverride,
}: {
  version: PortfolioVersion;
  editMode?: boolean;
  onSignatureMove?: (placement: SignaturePlacement) => void;
  onSignaturePlacementDraft?: (placement: SignaturePlacement) => void;
  onPlacementCancel?: () => void;
  placementMode?: boolean;
  signaturePlacementOverride?: SignaturePlacement;
}) {
  const template = version.presentation.layout_template ?? "clean";
  const Template = TEMPLATE_REGISTRY[template] ?? CleanTemplate;
  const placement =
    signaturePlacementOverride ??
    version.presentation.signature_placement ??
    defaultSignaturePlacementForTemplate(template);

  const rendered = <Template version={version} signaturePlacement={placement} />;

  if (editMode) {
    return (
      <EditLayer
        version={version}
        placementMode={placementMode}
        onSignatureMove={onSignatureMove}
        onSignaturePlacementDraft={onSignaturePlacementDraft}
        onPlacementCancel={onPlacementCancel}
        signaturePlacementOverride={signaturePlacementOverride}
      >
        {rendered}
      </EditLayer>
    );
  }

  return rendered;
}

export function defaultSignaturePlacementForTemplate(template: LayoutTemplate): SignaturePlacement {
  switch (template) {
    case "clean":
      return { mode: "inline" };
    case "showcase":
      return { mode: "fixed_side", side: "right" };
    case "aesthetic":
      return { mode: "fixed_hero" };
  }
}
