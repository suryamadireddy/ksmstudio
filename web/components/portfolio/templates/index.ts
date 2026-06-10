import type { LayoutTemplate } from "@/lib/types";
import type { ComponentType } from "react";
import { AestheticTemplate } from "./AestheticTemplate";
import { CleanTemplate } from "./CleanTemplate";
import { ShowcaseTemplate } from "./ShowcaseTemplate";
import type { TemplateProps } from "./template-types";

export { AestheticTemplate, CleanTemplate, ShowcaseTemplate };
export type { TemplateProps } from "./template-types";

export const TEMPLATE_REGISTRY: Record<LayoutTemplate, ComponentType<TemplateProps>> = {
  clean: CleanTemplate,
  showcase: ShowcaseTemplate,
  aesthetic: AestheticTemplate,
};
