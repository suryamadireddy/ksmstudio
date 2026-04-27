import type { Archetype } from "@/lib/types";
import { Statement } from "./Statement";
import { ProseBlock } from "./ProseBlock";
import { QuoteWall } from "./QuoteWall";
import { Timeline } from "./Timeline";
import { DataPanel } from "./DataPanel";
import { ImageFeature } from "./ImageFeature";
import { ListInventory } from "./ListInventory";
import { SideBySide } from "./SideBySide";
import { ArtifactExplorer } from "./ArtifactExplorer";
import { SignatureSlot } from "./SignatureSlot";
import { ConversationInvitation } from "./ConversationInvitation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ARCHETYPE_REGISTRY: Record<Archetype, React.FC<any>> = {
  statement: Statement,
  prose_block: ProseBlock,
  quote_wall: QuoteWall,
  timeline: Timeline,
  data_panel: DataPanel,
  image_feature: ImageFeature,
  list_inventory: ListInventory,
  side_by_side: SideBySide,
  artifact_explorer: ArtifactExplorer,
  signature_slot: SignatureSlot,
  conversation_invitation: ConversationInvitation,
};
