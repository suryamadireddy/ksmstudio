import { ScrollRevealField } from "./ScrollRevealField";
import { TimelineScrubber } from "./TimelineScrubber";
import { HoverInventory } from "./HoverInventory";
import { GeonewsGlobePlaceholder } from "./GeonewsGlobePlaceholder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LIBRARY: Record<string, React.FC<any>> = {
  scroll_reveal_field: ScrollRevealField,
  timeline_scrubber: TimelineScrubber,
  hover_inventory: HoverInventory,
  geonews_globe_placeholder: GeonewsGlobePlaceholder,
  // Bespoke components added here as built, e.g.:
  // geonews_globe: GeoNewsGlobe,
};

export function SignatureDispatcher({
  component,
  ...props
}: {
  component: string;
  [key: string]: unknown;
}) {
  const Component = LIBRARY[component];
  if (!Component) return null;
  return <Component {...props} />;
}
