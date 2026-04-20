import type { PortfolioVersion, SignaturePlacement } from "@/lib/types";

/** Pure template props — no edit-mode state (see EditLayer). */
export interface TemplateProps {
  version: PortfolioVersion;
  signaturePlacement: SignaturePlacement;
}
