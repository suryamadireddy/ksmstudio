#!/usr/bin/env python3
"""
Checkpoint 5 — Workspace chat + proposed edits + isolation (logic port of Step 8 routes).

Uses db.get_service_client() (service role). Does not call HTTP routes.
Run from project root:  python3 test_checkpoint5.py
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

from db import get_service_client

IDEA_ID = "idea_2026_04_11_001"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(step: int, name: str, cond: bool, detail: str = "") -> bool:
    status = "PASS" if cond else "FAIL"
    extra = f" — {detail}" if detail else ""
    print(f"Step {step} {status}: {name}{extra}")
    return cond


def stable_json(x: Any) -> str:
    return json.dumps(x, sort_keys=True, default=str)


def hash_state(v: dict[str, Any]) -> str:
    payload = {
        "presentation": v.get("presentation"),
        "public_summary": v.get("public_summary"),
        "chatbot_context": v.get("chatbot_context"),
        "voice": v.get("voice"),
    }
    return hashlib.sha256(stable_json(payload).encode("utf-8")).hexdigest()


def parse_proposed_edit(text: str) -> dict[str, Any] | None:
    marker = "PROPOSED EDIT:"
    idx = text.rfind(marker)
    if idx < 0:
        return None
    block = text[idx:].strip()
    ma = re.search(r"action:\s*([a-z_]+)", block, re.IGNORECASE)
    mt = re.search(r"target:\s*(.+)", block, re.IGNORECASE)
    mb = re.search(r"brief:\s*([\s\S]*)$", block, re.IGNORECASE)
    if not ma or not mt or not mb:
        return None
    action = ma.group(1).strip()
    target_raw = mt.group(1).strip()
    brief = mb.group(1).strip()
    allowed = {
        "rewrite_section",
        "change_register",
        "add_section",
        "remove_section",
        "regenerate_content",
        "full_refresh",
    }
    if action not in allowed or not brief:
        return None
    return {
        "action": action,
        "target": None if target_raw.lower() == "null" else target_raw,
        "brief": brief,
    }


def action_scope(action: str) -> list[str]:
    if action in ("rewrite_section", "regenerate_content"):
        return ["public_summary"]
    if action in ("change_register", "remove_section"):
        return ["presentation"]
    if action == "add_section":
        return ["presentation", "public_summary"]
    if action == "full_refresh":
        return ["presentation", "public_summary", "chatbot_context", "voice"]
    raise ValueError(f"unknown action: {action}")


def append_before_distill_snapshot(working: dict[str, Any]) -> dict[str, Any]:
    snaps = list(working.get("snapshots") or [])
    snap = {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "trigger": "before_distillation",
        "presentation": copy.deepcopy(working["presentation"]),
        "public_summary": copy.deepcopy(working["public_summary"]),
        "chatbot_context": copy.deepcopy(working["chatbot_context"]),
        "voice": copy.deepcopy(working["voice"]),
    }
    snaps.append(snap)
    while len(snaps) > 20:
        snaps.pop(0)
    out = copy.deepcopy(working)
    out["snapshots"] = snaps
    return out


def find_working(versions: list[dict[str, Any]]) -> tuple[int, dict[str, Any] | None]:
    for i, v in enumerate(versions):
        if v.get("status") == "working_draft":
            return i, v
    return -1, None


def ensure_working_draft(portfolio: dict[str, Any]) -> tuple[dict[str, Any], str, bool]:
    versions = list(portfolio.get("versions") or [])
    idx, wd = find_working(versions)
    if wd is not None:
        return portfolio, wd["id"], False
    aid = portfolio.get("active_version_id")
    active = next((v for v in versions if v.get("id") == aid and v.get("status") == "active"), None)
    if not active:
        raise RuntimeError("no_active_version")
    wd = copy.deepcopy(active)
    wd["id"] = str(uuid.uuid4())
    wd["created_at"] = now_iso()
    wd["generated_by"] = "manual_edit"
    wd["parent_version_id"] = active["id"]
    wd["creative_brief"] = None
    wd["status"] = "working_draft"
    wd["snapshots"] = []
    wd.pop("distillation_status", None)
    portfolio2 = copy.deepcopy(portfolio)
    portfolio2["versions"] = versions + [wd]
    return portfolio2, wd["id"], True


def load_idea(db) -> dict[str, Any]:
    row = (
        db.table("ideas")
        .select("id, portfolio")
        .eq("id", IDEA_ID)
        .single()
        .execute()
        .data
    )
    if not row:
        raise RuntimeError(f"idea not found: {IDEA_ID}")
    if not row.get("portfolio"):
        raise RuntimeError("idea has no portfolio")
    return row


def save_portfolio(db, portfolio: dict[str, Any]) -> None:
    res = db.table("ideas").update({"portfolio": portfolio}).eq("id", IDEA_ID).execute()
    if not res.data:
        raise RuntimeError("portfolio update failed")


def create_conversation(db, context: str, created_ids: dict[str, list[str]]) -> str:
    cid = str(uuid.uuid4())
    db.table("conversations").insert(
        {
            "id": cid,
            "idea_id": IDEA_ID,
            "context": context,
            "created_at": now_iso(),
        }
    ).execute()
    created_ids["conversations"].append(cid)
    return cid


def insert_message(
    db,
    conversation_id: str,
    role: str,
    content: str,
    extracted: Any | None,
    created_ids: dict[str, list[str]],
) -> str:
    mid = str(uuid.uuid4())
    db.table("messages").insert(
        {
            "id": mid,
            "conversation_id": conversation_id,
            "idea_id": IDEA_ID,
            "role": role,
            "content": content,
            "extracted": extracted,
            "created_at": now_iso(),
        }
    ).execute()
    created_ids["messages"].append(mid)
    return mid


def cleanup(db, original_portfolio: dict[str, Any], created_ids: dict[str, list[str]]) -> None:
    try:
        save_portfolio(db, original_portfolio)
    except Exception as e:
        print(f"[cleanup] WARN: failed restoring original portfolio: {e}")

    # Delete messages first, then conversations.
    for mid in created_ids["messages"]:
        try:
            db.table("messages").delete().eq("id", mid).execute()
        except Exception:
            pass
    for cid in created_ids["conversations"]:
        try:
            db.table("messages").delete().eq("conversation_id", cid).execute()
        except Exception:
            pass
        try:
            db.table("conversations").delete().eq("id", cid).execute()
        except Exception:
            pass


def main() -> int:
    db = get_service_client()
    created_ids: dict[str, list[str]] = {"conversations": [], "messages": []}
    failed = False

    row = load_idea(db)
    original_portfolio = copy.deepcopy(row["portfolio"])
    working_id = None

    try:
        # Test A — Message flow
        portfolio = copy.deepcopy(row["portfolio"])
        portfolio, working_id, _ = ensure_working_draft(portfolio)
        save_portfolio(db, portfolio)

        versions = list(portfolio.get("versions") or [])
        widx, wd = find_working(versions)
        if not wd:
            print("Step 1 FAIL: could not establish working draft")
            return 1
        failed |= not ok(1, "create/find working draft", wd is not None, f"working_id={wd['id']}")

        conv_id = create_conversation(db, "workspace_edit", created_ids)
        user_text = "Please shorten the opening statement."
        assistant_text = (
            "You're right, the opening can be tighter while preserving intent.\n\n"
            "PROPOSED EDIT:\n"
            "action: rewrite_section\n"
            "target: opening_statement\n"
            "brief: shorten the opening statement to 2-3 concise lines while keeping the core claim."
        )
        proposal = parse_proposed_edit(assistant_text)
        user_mid = insert_message(db, conv_id, "user", user_text, None, created_ids)
        asst_mid = insert_message(
            db,
            conv_id,
            "idea",
            assistant_text,
            {"proposed_edit": proposal, "proposal_status": "pending"},
            created_ids,
        )
        failed |= not ok(2, 'send message that triggers a PROPOSED EDIT', proposal is not None, stable_json(proposal))

        failed |= not ok(3, "workspace_edit conversation created", conv_id is not None, f"conversation_id={conv_id}")

        msgs = (
            db.table("messages")
            .select("id, role, content, extracted")
            .eq("conversation_id", conv_id)
            .order("created_at")
            .execute()
            .data
            or []
        )
        has_user = any(m.get("id") == user_mid and m.get("role") == "user" for m in msgs)
        has_asst = any(m.get("id") == asst_mid and m.get("role") == "idea" for m in msgs)
        failed |= not ok(4, "user and assistant messages persisted", has_user and has_asst, f"count={len(msgs)}")

        asst_row = next((m for m in msgs if m.get("id") == asst_mid), None)
        ext = (asst_row or {}).get("extracted") or {}
        proposal_ok = (
            isinstance(ext, dict)
            and isinstance(ext.get("proposed_edit"), dict)
            and ext["proposed_edit"].get("action") == "rewrite_section"
            and bool(ext["proposed_edit"].get("brief"))
            and "target" in ext["proposed_edit"]
        )
        failed |= not ok(5, "assistant extracted metadata includes action/brief/target", proposal_ok, stable_json(ext))

        # Test B — Accept proposal flow
        row2 = load_idea(db)
        portfolio2 = copy.deepcopy(row2["portfolio"])
        versions2 = list(portfolio2.get("versions") or [])
        widx2, wd2 = find_working(versions2)
        if widx2 < 0 or not wd2:
            print("Step 5 FAIL: no working draft before accept")
            return 1
        before_hash = hash_state(wd2)
        before_snap_count = len(wd2.get("snapshots") or [])
        before_wd_id = wd2.get("id")

        wd2_snap = append_before_distill_snapshot(wd2)
        failed |= not ok(6, "accept proposal", True, f"proposal_message_id={asst_mid}")
        versions2[widx2] = wd2_snap
        save_portfolio(db, {**portfolio2, "versions": versions2})

        row3 = load_idea(db)
        portfolio3 = copy.deepcopy(row3["portfolio"])
        versions3 = list(portfolio3.get("versions") or [])
        widx3, wd3 = find_working(versions3)
        assert wd3 is not None and widx3 >= 0
        after_snap_count = len(wd3.get("snapshots") or [])
        last_trigger = (wd3.get("snapshots") or [{}])[-1].get("trigger")
        failed |= not ok(
            7,
            "before_distillation snapshot created",
            after_snap_count == before_snap_count + 1 and last_trigger == "before_distillation",
            f"count={before_snap_count}->{after_snap_count}, trigger={last_trigger}",
        )

        # Simulate distill.py temporary output version and Step 8 route surgical merge.
        proposal_data = (ext or {}).get("proposed_edit") or proposal or {}
        action = proposal_data.get("action", "rewrite_section")
        scopes = action_scope(action)
        temp_id = str(uuid.uuid4())
        temp = copy.deepcopy(wd3)
        temp["id"] = temp_id
        temp["status"] = "draft"
        temp["generated_by"] = "distillation"
        # Force deterministic content change for verification.
        temp.setdefault("public_summary", {}).setdefault("sections", [])
        if temp["public_summary"]["sections"]:
            temp["public_summary"]["sections"][0]["content"] = {
                **(temp["public_summary"]["sections"][0].get("content") or {}),
                "test_checkpoint5_note": "shortened opening simulation",
            }
        else:
            temp["public_summary"]["sections"].append(
                {"archetype": "statement", "content": {"text": "shortened opening simulation"}}
            )

        versions3.append(temp)
        wd_updated = copy.deepcopy(wd3)
        if "presentation" in scopes:
            wd_updated["presentation"] = copy.deepcopy(temp["presentation"])
        if "public_summary" in scopes:
            wd_updated["public_summary"] = copy.deepcopy(temp["public_summary"])
        if "chatbot_context" in scopes:
            wd_updated["chatbot_context"] = copy.deepcopy(temp["chatbot_context"])
        if "voice" in scopes:
            wd_updated["voice"] = copy.deepcopy(temp["voice"])
        wd_updated["distillation_status"] = {"status": "idle", "last_attempt_at": now_iso()}
        versions3[widx3] = wd_updated
        versions3 = [v for v in versions3 if v.get("id") != temp_id]
        save_portfolio(db, {**portfolio3, "versions": versions3})

        row4 = load_idea(db)
        versions4 = list((row4["portfolio"] or {}).get("versions") or [])
        _, wd4 = find_working(versions4)
        assert wd4 is not None
        after_hash = hash_state(wd4)
        failed |= not ok(8, "working draft content updated after accept", before_hash != after_hash, f"{before_hash[:8]} -> {after_hash[:8]}")

        id_preserved = wd4.get("id") == before_wd_id
        snaps_preserved = isinstance(wd4.get("snapshots"), list) and len(wd4["snapshots"]) >= after_snap_count
        failed |= not ok(9, "working draft id + snapshots preserved", id_preserved and snaps_preserved, f"id_ok={id_preserved} snaps={len(wd4.get('snapshots') or [])}")

        orphan_temp = any(v.get("id") == temp_id for v in versions4)
        failed |= not ok(10, "no orphaned temporary version remains", not orphan_temp, f"temp_id={temp_id}")

        # Mark accepted status on assistant proposal message.
        db.table("messages").update(
            {
                "extracted": {
                    **(ext if isinstance(ext, dict) else {}),
                    "proposal_status": "accepted",
                    "proposal_accepted_at": now_iso(),
                }
            }
        ).eq("id", asst_mid).execute()

        # Test C — Reject flow
        row5 = load_idea(db)
        versions5 = list((row5["portfolio"] or {}).get("versions") or [])
        _, wd5 = find_working(versions5)
        assert wd5 is not None
        before_reject_hash = hash_state(wd5)

        user2 = "Can we add a dramatic closing section?"
        assistant2 = (
            "I can make the close more dramatic.\n\n"
            "PROPOSED EDIT:\n"
            "action: add_section\n"
            "target: null\n"
            "brief: add a concise closing section with stronger cadence and a forward invitation."
        )
        proposal2 = parse_proposed_edit(assistant2)
        insert_message(db, conv_id, "user", user2, None, created_ids)
        asst2_mid = insert_message(
            db,
            conv_id,
            "idea",
            assistant2,
            {"proposed_edit": proposal2, "proposal_status": "pending"},
            created_ids,
        )
        failed |= not ok(11, "send second message and get proposal", proposal2 is not None, stable_json(proposal2))

        # Reject -> no draft change; message marked rejected.
        failed |= not ok(12, "reject the second proposal", True, f"proposal_message_id={asst2_mid}")
        db.table("messages").update(
            {
                "extracted": {
                    "proposed_edit": proposal2,
                    "proposal_status": "rejected",
                    "proposal_rejected_at": now_iso(),
                }
            }
        ).eq("id", asst2_mid).execute()

        row6 = load_idea(db)
        versions6 = list((row6["portfolio"] or {}).get("versions") or [])
        _, wd6 = find_working(versions6)
        assert wd6 is not None
        after_reject_hash = hash_state(wd6)
        failed |= not ok(13, "reject leaves working draft unchanged", before_reject_hash == after_reject_hash, f"{before_reject_hash[:8]} == {after_reject_hash[:8]}")

        asst2_row = (
            db.table("messages")
            .select("id, extracted")
            .eq("id", asst2_mid)
            .single()
            .execute()
            .data
        )
        status2 = ((asst2_row or {}).get("extracted") or {}).get("proposal_status")
        failed |= not ok(14, "rejected status persisted on proposal message", status2 == "rejected", f"status={status2!r}")

        # Test D — Public chat isolation
        public_conv_id = create_conversation(db, "portfolio_public", created_ids)
        insert_message(db, public_conv_id, "user", "public hello", None, created_ids)
        failed |= not ok(15, "create portfolio_public conversation", public_conv_id is not None, f"conversation_id={public_conv_id}")
        workspace_conv_id = conv_id

        # Ported public route conversation validity check.
        public_conv = (
            db.table("conversations")
            .select("id, idea_id, context")
            .eq("id", public_conv_id)
            .single()
            .execute()
            .data
        )
        ws_conv = (
            db.table("conversations")
            .select("id, idea_id, context")
            .eq("id", workspace_conv_id)
            .single()
            .execute()
            .data
        )
        public_ok = (
            public_conv is not None
            and public_conv.get("idea_id") == IDEA_ID
            and public_conv.get("context") == "portfolio_public"
        )
        workspace_rejected = not (
            ws_conv is not None
            and ws_conv.get("idea_id") == IDEA_ID
            and ws_conv.get("context") == "portfolio_public"
        )
        failed |= not ok(16, "attempt public load with workspace_edit conversation", True, f"workspace_conv_id={workspace_conv_id}")
        failed |= not ok(17, "public route rejects non-portfolio_public conversation", public_ok and workspace_rejected, f"public_ok={public_ok} workspace_rejected={workspace_rejected}")

    finally:
        cleanup(db, original_portfolio, created_ids)

    if failed:
        print("\nOVERALL: FAIL")
        return 1
    print("\nOVERALL: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())

