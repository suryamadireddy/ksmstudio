"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import type { PortfolioVersion, SignaturePlacement } from "@/lib/types";

export interface EditLayerProps {
  children: React.ReactNode;
  version: PortfolioVersion;
  placementMode?: boolean;
  onSignatureMove?: (placement: SignaturePlacement) => void;
  onSignaturePlacementDraft?: (placement: SignaturePlacement) => void;
  onPlacementCancel?: () => void;
  signaturePlacementOverride?: SignaturePlacement;
}

type DragSession =
  | {
      kind: "move";
      startX: number;
      startY: number;
      start: SignaturePlacement;
    }
  | {
      kind: "resize";
      startX: number;
      startY: number;
      start: SignaturePlacement;
    };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

type FloatingPlacement = SignaturePlacement & {
  mode: "floating";
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
};

function isFloatingComplete(p: SignaturePlacement | undefined): p is FloatingPlacement {
  return (
    p != null &&
    p.mode === "floating" &&
    typeof p.x_pct === "number" &&
    typeof p.y_pct === "number" &&
    typeof p.width_pct === "number" &&
    typeof p.height_pct === "number"
  );
}

function detachPair(
  ref: MutableRefObject<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>,
) {
  const pair = ref.current;
  if (!pair) return;
  window.removeEventListener("pointermove", pair.move);
  window.removeEventListener("pointerup", pair.up);
  ref.current = null;
}

/**
 * Workspace-only shell: floating signature styling; placement mode overlay, drag, resize, commit.
 * TODO(krishna): Re-verify BR resize pointer capture across browsers; promote if still flaky after QA.
 */
export function EditLayer({
  children,
  version,
  placementMode,
  onSignatureMove,
  onSignaturePlacementDraft,
  onPlacementCancel,
  signaturePlacementOverride,
}: EditLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const slotWindowListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  const resizeWindowListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  const detachAllWindowDragListeners = useCallback(() => {
    detachPair(slotWindowListenersRef);
    detachPair(resizeWindowListenersRef);
  }, []);

  const draftRef = useRef(signaturePlacementOverride);
  const onDraftRef = useRef(onSignaturePlacementDraft);
  const onCommitRef = useRef(onSignatureMove);

  const [resizeHandleBox, setResizeHandleBox] = useState<{
    left: number;
    top: number;
  } | null>(null);

  draftRef.current = signaturePlacementOverride;
  onDraftRef.current = onSignaturePlacementDraft;
  onCommitRef.current = onSignatureMove;

  const applyFloatingStyle = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>("[data-signature-slot]");
    if (!el) return;
    const effectivePlacement = signaturePlacementOverride ?? version.presentation.signature_placement;
    if (!effectivePlacement || effectivePlacement.mode !== "floating") {
      el.style.position = "";
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.cursor = "";
      return;
    }
    const { x_pct, y_pct, width_pct, height_pct } = effectivePlacement;
    if (
      x_pct === undefined ||
      y_pct === undefined ||
      width_pct === undefined ||
      height_pct === undefined
    ) {
      return;
    }
    el.style.position = "absolute";
    el.style.left = `${x_pct}%`;
    el.style.top = `${y_pct}%`;
    el.style.width = `${width_pct}%`;
    el.style.height = `${height_pct}%`;
    el.style.transform = "translate(-50%, -50%)";
    el.style.zIndex = "20";
    el.style.cursor = placementMode ? "grab" : "";
  }, [signaturePlacementOverride, version.presentation.signature_placement, placementMode]);

  useEffect(() => {
    applyFloatingStyle();
  }, [applyFloatingStyle]);

  const updateResizeHandlePosition = useCallback(() => {
    const root = rootRef.current;
    if (!root || !placementMode || !isFloatingComplete(signaturePlacementOverride)) {
      setResizeHandleBox(null);
      return;
    }
    const slot = root.querySelector<HTMLElement>("[data-signature-slot]");
    if (!slot) {
      setResizeHandleBox(null);
      return;
    }
    const rr = root.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    setResizeHandleBox({
      left: sr.right - rr.left - 10,
      top: sr.bottom - rr.top - 10,
    });
  }, [placementMode, signaturePlacementOverride]);

  useLayoutEffect(() => {
    updateResizeHandlePosition();
  }, [updateResizeHandlePosition, children]);

  useEffect(() => {
    if (!placementMode) return;
    const onResize = () => updateResizeHandlePosition();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => updateResizeHandlePosition());
    if (rootRef.current) ro.observe(rootRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [placementMode, updateResizeHandlePosition]);

  const handleRootPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!placementMode || !onPlacementCancel) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("[data-signature-slot]") || el.closest("[data-signature-resize-handle]")) return;
      e.stopPropagation();
      onPlacementCancel();
    },
    [placementMode, onPlacementCancel],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !placementMode) return;
    const slot = root.querySelector<HTMLElement>("[data-signature-slot]");
    if (!slot) return;

    const onSlotPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-signature-resize-handle]")) return;
      const current = draftRef.current;
      if (!isFloatingComplete(current)) return;
      e.stopPropagation();
      e.preventDefault();
      dragSessionRef.current = {
        kind: "move",
        startX: e.clientX,
        startY: e.clientY,
        start: { ...current },
      };
      try {
        slot.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || session.kind !== "move") return;
        const r = root.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const dx = ev.clientX - session.startX;
        const dy = ev.clientY - session.startY;
        const dxPct = (dx / r.width) * 100;
        const dyPct = (dy / r.height) * 100;
        const start = session.start;
        if (!isFloatingComplete(start)) return;
        const { x_pct: sx, y_pct: sy, width_pct: sw, height_pct: sh } = start;
        const next: SignaturePlacement = {
          mode: "floating",
          x_pct: clamp(sx + dxPct, 5, 95),
          y_pct: clamp(sy + dyPct, 5, 95),
          width_pct: clamp(sw, 12, 92),
          height_pct: clamp(sh, 12, 92),
        };
        onDraftRef.current?.(next);
      };

      const onUp = (ev: PointerEvent) => {
        dragSessionRef.current = null;
        try {
          slot.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        detachPair(slotWindowListenersRef);
        const latest = draftRef.current;
        if (isFloatingComplete(latest)) {
          onCommitRef.current?.(latest);
        }
      };

      detachAllWindowDragListeners();
      slotWindowListenersRef.current = { move: onMove, up: onUp };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    slot.addEventListener("pointerdown", onSlotPointerDown);
    return () => {
      detachAllWindowDragListeners();
      slot.removeEventListener("pointerdown", onSlotPointerDown);
    };
  }, [placementMode, detachAllWindowDragListeners]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!placementMode) return;
      const current = draftRef.current;
      if (!isFloatingComplete(current)) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      dragSessionRef.current = {
        kind: "resize",
        startX: e.clientX,
        startY: e.clientY,
        start: { ...current },
      };
      const handle = e.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || session.kind !== "resize") return;
        const r = rootRef.current?.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return;
        const dx = ev.clientX - session.startX;
        const dy = ev.clientY - session.startY;
        const dwPct = (dx / r.width) * 100;
        const dhPct = (dy / r.height) * 100;
        const st = session.start;
        if (!isFloatingComplete(st)) return;
        const { x_pct: cx, y_pct: cy, width_pct: cw, height_pct: ch } = st;
        const next: SignaturePlacement = {
          mode: "floating",
          x_pct: cx,
          y_pct: cy,
          width_pct: clamp(cw + dwPct, 14, 92),
          height_pct: clamp(ch + dhPct, 14, 92),
        };
        onDraftRef.current?.(next);
      };

      const onUp = (ev: PointerEvent) => {
        dragSessionRef.current = null;
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        detachPair(resizeWindowListenersRef);
        const latest = draftRef.current;
        if (isFloatingComplete(latest)) {
          onCommitRef.current?.(latest);
        }
      };

      detachAllWindowDragListeners();
      resizeWindowListenersRef.current = { move: onMove, up: onUp };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [placementMode, detachAllWindowDragListeners],
  );

  return (
    <div
      ref={rootRef}
      className="portfolio-edit-layer relative isolate min-h-full"
      data-portfolio-version={version.id}
      onPointerDownCapture={handleRootPointerDownCapture}
    >
      {placementMode ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4 text-center text-[11px] font-medium"
          style={{ color: "var(--studio-amber-dim, #b45309)" }}
        >
          Drag the signature on the preview to reposition. Drag the corner handle to resize. Click outside the
          signature to cancel.
        </div>
      ) : null}
      {children}
      {placementMode && resizeHandleBox ? (
        <button
          type="button"
          data-signature-resize-handle
          aria-label="Resize signature"
          className="absolute z-40 h-4 w-4 cursor-nwse-resize rounded-sm border-2"
          style={{
            left: resizeHandleBox.left,
            top: resizeHandleBox.top,
            borderColor: "var(--studio-amber, #d97706)",
            backgroundColor: "var(--studio-bg, #0c0a09)",
          }}
          onPointerDown={onResizePointerDown}
        />
      ) : null}
    </div>
  );
}
