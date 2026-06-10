export type WorkspaceProposedAction =
  | "rewrite_section"
  | "change_register"
  | "add_section"
  | "remove_section"
  | "regenerate_content"
  | "full_refresh";

export type DistillMode = "default" | "presentation_only" | "full_regen";

export interface WorkspaceProposedEdit {
  action: WorkspaceProposedAction;
  target: string | null;
  brief: string;
}

const ACTIONS = new Set<WorkspaceProposedAction>([
  "rewrite_section",
  "change_register",
  "add_section",
  "remove_section",
  "regenerate_content",
  "full_refresh",
]);

export function parseProposedEdit(text: string): WorkspaceProposedEdit | null {
  const marker = "PROPOSED EDIT:";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return null;
  const block = text.slice(idx).trim();
  const actionMatch = block.match(/action:\s*([a-z_]+)/i);
  const targetMatch = block.match(/target:\s*(.+)/i);
  const briefMatch = block.match(/brief:\s*([\s\S]*)$/i);
  if (!actionMatch || !targetMatch || !briefMatch) return null;

  const action = actionMatch[1].trim() as WorkspaceProposedAction;
  if (!ACTIONS.has(action)) return null;

  const targetRaw = targetMatch[1].trim();
  const brief = briefMatch[1].trim();
  if (!brief) return null;
  return {
    action,
    target: targetRaw.toLowerCase() === "null" ? null : targetRaw,
    brief,
  };
}

export function stripProposedEditBlock(text: string): string {
  const marker = "PROPOSED EDIT:";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return text.trim();
  return text.slice(0, idx).trim();
}

export function actionToDistillMode(action: WorkspaceProposedAction): DistillMode {
  switch (action) {
    case "change_register":
    case "remove_section":
      return "presentation_only";
    case "full_refresh":
      return "full_regen";
    case "rewrite_section":
    case "add_section":
    case "regenerate_content":
      return "default";
  }
}

export function actionUpdateScope(action: WorkspaceProposedAction): Array<"presentation" | "public_summary" | "chatbot_context" | "voice"> {
  switch (action) {
    case "rewrite_section":
    case "regenerate_content":
      return ["public_summary"];
    case "change_register":
    case "remove_section":
      return ["presentation"];
    case "add_section":
      return ["presentation", "public_summary"];
    case "full_refresh":
      return ["presentation", "public_summary", "chatbot_context", "voice"];
  }
}

