import type { PortfolioVersion } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function hasStringFields(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => isString(value[field]));
}

function isRenderableSection(section: unknown): boolean {
  if (!isRecord(section) || !isString(section.archetype)) return false;

  const content = section.content;
  switch (section.archetype) {
    case "statement":
      return hasStringFields(content, ["text"]);
    case "prose_block":
      return isRecord(content) && isStringArray(content.paragraphs);
    case "quote_wall":
      return hasStringFields(content, ["quote"]);
    case "timeline":
      return (
        isRecord(content) &&
        Array.isArray(content.entries) &&
        content.entries.every((entry) => hasStringFields(entry, ["date", "title", "body"]))
      );
    case "data_panel":
      return (
        isRecord(content) &&
        Array.isArray(content.items) &&
        content.items.every((item) => hasStringFields(item, ["label", "value"]))
      );
    case "image_feature":
      return hasStringFields(content, ["caption", "image_brief"]);
    case "list_inventory":
      return (
        isRecord(content) &&
        Array.isArray(content.items) &&
        content.items.every((item) => hasStringFields(item, ["label", "body"]))
      );
    case "side_by_side":
      return (
        isRecord(content) &&
        hasStringFields(content.left, ["label", "body"]) &&
        hasStringFields(content.right, ["label", "body"])
      );
    case "artifact_explorer":
      return (
        isRecord(content) &&
        ["brief", "synthesis", "prd"].includes(String(content.preselected)) &&
        isString(content.intro)
      );
    case "signature_slot":
      return isRecord(content);
    case "conversation_invitation":
      return (
        isRecord(content) &&
        isString(content.intro) &&
        isStringArray(content.prompt_suggestions)
      );
    default:
      return false;
  }
}

export function isRenderablePortfolioVersion(
  version: unknown,
): version is PortfolioVersion {
  if (!isRecord(version)) return false;

  const presentation = version.presentation;
  const publicSummary = version.public_summary;
  const chatbotContext = version.chatbot_context;
  const voiceDna = isRecord(chatbotContext) ? chatbotContext.voice_dna : null;

  return (
    isString(version.id) &&
    isRecord(presentation) &&
    isString(presentation.accent_color) &&
    isString(presentation.visual_register) &&
    isRecord(publicSummary) &&
    Array.isArray(publicSummary.sections) &&
    publicSummary.sections.every(isRenderableSection) &&
    isRecord(chatbotContext) &&
    isString(chatbotContext.identity_statement) &&
    isString(chatbotContext.default_posture) &&
    isString(chatbotContext.current_state) &&
    isStringArray(chatbotContext.open_curiosities) &&
    isStringArray(chatbotContext.idea_specific_refusals) &&
    isRecord(voiceDna) &&
    isString(voiceDna.tonal_register) &&
    isString(voiceDna.sentence_rhythm) &&
    isStringArray(voiceDna.vocabulary) &&
    isStringArray(voiceDna.metaphor_sources) &&
    isStringArray(voiceDna.what_it_doesnt_do)
  );
}

export function getRenderableActiveVersion(portfolio: unknown): PortfolioVersion | null {
  if (!isRecord(portfolio) || !isString(portfolio.active_version_id)) return null;
  if (!Array.isArray(portfolio.versions)) return null;

  const activeVersion = portfolio.versions.find(
    (version) =>
      isRecord(version) &&
      version.id === portfolio.active_version_id &&
      version.status === "active",
  );

  return isRenderablePortfolioVersion(activeVersion) ? activeVersion : null;
}
