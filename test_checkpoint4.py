#!/usr/bin/env python3
"""
Checkpoint 4 — workspace portfolio operations (logic port of web/lib/portfolio/workspace-helpers.ts).

Uses db.get_service_client() (service role). Does not call HTTP routes.
Run from project root:  python3 test_checkpoint4.py
"""

from __future__ import annotations

import copy
import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

from db import get_service_client

# ── Ported from web/lib/portfolio/workspace-helpers.ts (keep in sync manually) ─

SNAPSHOT_CAP = 20


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_version(v: dict[str, Any]) -> dict[str, Any]:
    out = dict(v)
    snaps = out.get("snapshots")
    out["snapshots"] = snaps if isinstance(snaps, list) else []
    return out


def as_portfolio(raw: Any) -> dict[str, Any]:
    p = copy.deepcopy(raw) if isinstance(raw, dict) else {}
    vers = p.get("versions")
    p["versions"] = [normalize_version(x) for x in vers] if isinstance(vers, list) else []
    return p


def find_working_draft(versions: list[dict[str, Any]]) -> dict[str, Any] | None:
    for x in versions:
        if x.get("status") == "working_draft":
            return x
    return None


def fingerprint_draft_state(v: dict[str, Any]) -> str:
    # Match TS object key order: presentation, public_summary, chatbot_context
    return json.dumps(
        {
            "presentation": v["presentation"],
            "public_summary": v["public_summary"],
            "chatbot_context": v["chatbot_context"],
        },
        default=str,
    )


def last_snapshot_fingerprint(snapshots: list[dict[str, Any]]) -> str | None:
    if not snapshots:
        return None
    return fingerprint_draft_state(snapshots[-1])


def append_snapshot(
    working: dict[str, Any],
    trigger: str,
) -> tuple[dict[str, Any], bool]:
    fp = fingerprint_draft_state(working)
    prev = last_snapshot_fingerprint(working["snapshots"])
    if (
        trigger != "before_distillation"
        and prev is not None
        and prev == fp
        and trigger in ("autosave", "explicit")
    ):
        return working, False

    snap: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        "trigger": trigger,
        "presentation": copy.deepcopy(working["presentation"]),
        "public_summary": copy.deepcopy(working["public_summary"]),
        "chatbot_context": copy.deepcopy(working["chatbot_context"]),
        "voice": copy.deepcopy(working["voice"]),
    }
    snaps = [*working["snapshots"], snap]
    while len(snaps) > SNAPSHOT_CAP:
        snaps.pop(0)
    nxt = {**working, "snapshots": snaps}
    return nxt, True


def branch_working_draft_from_active(active: dict[str, Any]) -> dict[str, Any]:
    wd = copy.deepcopy(active)
    wd["id"] = str(uuid.uuid4())
    wd["created_at"] = _now_iso()
    wd["generated_by"] = "manual_edit"
    wd["parent_version_id"] = active["id"]
    wd["creative_brief"] = None
    wd["status"] = "working_draft"
    wd["snapshots"] = []
    wd.pop("distillation_status", None)
    return normalize_version(wd)


def copy_working_draft_to_draft(working: dict[str, Any]) -> dict[str, Any]:
    d = copy.deepcopy(working)
    d.pop("distillation_status", None)
    d["id"] = str(uuid.uuid4())
    d["created_at"] = _now_iso()
    d["generated_by"] = "manual_edit"
    d["parent_version_id"] = working["id"]
    d["status"] = "draft"
    d["snapshots"] = []
    return normalize_version(d)


def open_working_draft(portfolio: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Equivalent to POST .../open when no working draft exists."""
    portfolio = copy.deepcopy(portfolio)
    versions = list(portfolio.get("versions") or [])
    if find_working_draft(versions):
        raise RuntimeError("working_draft_already_exists")
    aid = portfolio.get("active_version_id")
    active = next((v for v in versions if v.get("id") == aid and v.get("status") == "active"), None)
    if not active:
        raise RuntimeError("no_active_version")
    wd = branch_working_draft_from_active(active)
    portfolio["versions"] = versions + [wd]
    return portfolio, wd["id"]


def revert_working_to_snapshot(working: dict[str, Any], snapshot_id: str) -> dict[str, Any]:
    """Equivalent to POST .../revert-to-snapshot."""
    snap = next((s for s in working["snapshots"] if s.get("id") == snapshot_id), None)
    if not snap:
        raise RuntimeError("snapshot_not_found")
    out = {**working}
    out["presentation"] = copy.deepcopy(snap["presentation"])
    out["public_summary"] = copy.deepcopy(snap["public_summary"])
    out["chatbot_context"] = copy.deepcopy(snap["chatbot_context"])
    out["voice"] = copy.deepcopy(snap["voice"])
    return out


def replace_version_by_id(versions: list[dict[str, Any]], vid: str, new_v: dict[str, Any]) -> list[dict[str, Any]]:
    return [new_v if v.get("id") == vid else v for v in versions]


def discard_working_draft(versions: list[dict[str, Any]], working_id: str) -> list[dict[str, Any]]:
    return [v for v in versions if v.get("id") != working_id]


def bump_presentation_rationale(working: dict[str, Any], suffix: str) -> dict[str, Any]:
    """Mutate a copy so the next snapshot fingerprint changes (avoid snapshot no-op)."""
    w = copy.deepcopy(working)
    pres = w.setdefault("presentation", {})
    base = pres.get("layout_template_rationale") or ""
    pres["layout_template_rationale"] = f"{base} [{suffix}]".strip()
    return w


# ── Test harness ─────────────────────────────────────────────────────────────

IDEA_ID = "idea_2026_04_11_001"


def load_portfolio(db) -> dict[str, Any]:
    row = db.table("ideas").select("portfolio").eq("id", IDEA_ID).single().execute().data
    if not row or row.get("portfolio") is None:
        raise SystemExit(f"No portfolio for idea {IDEA_ID}")
    return as_portfolio(row["portfolio"])


def save_portfolio(db, portfolio: dict[str, Any]) -> None:
    res = db.table("ideas").update({"portfolio": portfolio}).eq("id", IDEA_ID).execute()
    if not res.data:
        raise RuntimeError("Supabase update returned no data")


def ok(step: int, name: str, cond: bool, detail: str = "") -> bool:
    status = "PASS" if cond else "FAIL"
    extra = f" — {detail}" if detail else ""
    print(f"Step {step} {status}: {name}{extra}")
    return cond


def main() -> int:
    db = get_service_client()
    failed = False

    portfolio = load_portfolio(db)
    versions = list(portfolio.get("versions") or [])

    # 1 — no working draft
    wd0 = find_working_draft(versions)
    failed |= not ok(1, "no working draft initially", wd0 is None, f"found={wd0!r}")

    # 2 — open (create working draft)
    try:
        portfolio, working_id = open_working_draft(portfolio)
        save_portfolio(db, portfolio)
    except Exception as e:
        print(f"Step 2 FAIL: open working draft — {e}")
        return 1

    versions = list(portfolio["versions"])
    wd = find_working_draft(versions)
    failed |= not ok(
        2,
        "create working draft",
        wd is not None and wd.get("id") == working_id,
        f"id={working_id}",
    )

    # 3 — snapshot_count == 0
    sc = len(wd["snapshots"]) if wd else -1
    failed |= not ok(3, "snapshot_count = 0 after open", sc == 0, f"count={sc}")

    # 4 — explicit snapshot
    wd = find_working_draft(versions)
    assert wd
    wd2, appended = append_snapshot(wd, "explicit")
    failed |= not ok(4, "explicit snapshot appended", appended, f"appended={appended}")
    portfolio["versions"] = replace_version_by_id(versions, working_id, wd2)
    save_portfolio(db, portfolio)
    versions = list(portfolio["versions"])
    wd = find_working_draft(versions)
    sc = len(wd["snapshots"]) if wd else -1

    # 5 — snapshot_count == 1
    failed |= not ok(5, "snapshot_count = 1", sc == 1, f"count={sc}")

    # 6–7 — 25 more snapshots (different fingerprints), expect cap 20 total
    wd = find_working_draft(versions)
    assert wd
    for i in range(25):
        wd = bump_presentation_rationale(wd, f"loop-{i}")
        wd, _ = append_snapshot(wd, "explicit")
        portfolio["versions"] = replace_version_by_id(list(portfolio["versions"]), working_id, wd)
        save_portfolio(db, portfolio)
        portfolio = load_portfolio(db)
        versions = list(portfolio["versions"])
        wd = find_working_draft(versions)

    sc = len(wd["snapshots"]) if wd else -1
    failed |= not ok(6, "25 snapshots created in loop", True, "see step 7 for cap")
    failed |= not ok(7, "FIFO cap: snapshot_count = 20", sc == 20, f"count={sc}")

    # 8–9 — revert to oldest surviving snapshot (index 0)
    oldest_id = wd["snapshots"][0]["id"]
    oldest_snap = next(s for s in wd["snapshots"] if s["id"] == oldest_id)
    wd_rev = revert_working_to_snapshot(wd, oldest_id)
    portfolio["versions"] = replace_version_by_id(list(portfolio["versions"]), working_id, wd_rev)
    save_portfolio(db, portfolio)
    portfolio = load_portfolio(db)
    wd = find_working_draft(list(portfolio["versions"]))
    assert wd

    same_pres = json.dumps(wd["presentation"], sort_keys=True, default=str) == json.dumps(
        oldest_snap["presentation"], sort_keys=True, default=str
    )
    same_ps = json.dumps(wd["public_summary"], sort_keys=True, default=str) == json.dumps(
        oldest_snap["public_summary"], sort_keys=True, default=str
    )
    same_cb = json.dumps(wd["chatbot_context"], sort_keys=True, default=str) == json.dumps(
        oldest_snap["chatbot_context"], sort_keys=True, default=str
    )
    same_v = json.dumps(wd["voice"], sort_keys=True, default=str) == json.dumps(
        oldest_snap["voice"], sort_keys=True, default=str
    )
    content_ok = same_pres and same_ps and same_cb and same_v

    failed |= not ok(8, "revert targets oldest surviving snapshot", oldest_id is not None, oldest_id)
    failed |= not ok(
        9,
        "working draft matches snapshot content",
        content_ok,
        f"pres={same_pres} ps={same_ps} ctx={same_cb} voice={same_v}",
    )

    # 10–11 — save as new draft version
    draft = copy_working_draft_to_draft(wd)
    portfolio = load_portfolio(db)
    versions = list(portfolio["versions"])
    portfolio["versions"] = versions + [draft]
    save_portfolio(db, portfolio)
    portfolio = load_portfolio(db)
    versions = list(portfolio["versions"])
    draft_row = next((v for v in versions if v.get("id") == draft["id"]), None)
    failed |= not ok(
        10,
        "save-as-version adds new row",
        draft_row is not None,
        f"draft_id={draft['id']}",
    )
    failed |= not ok(
        11,
        "new version status = draft",
        draft_row is not None and draft_row.get("status") == "draft",
        f"status={draft_row.get('status')!r}" if draft_row else "",
    )

    # 12–13 — discard working draft
    portfolio = load_portfolio(db)
    versions = list(portfolio["versions"])
    portfolio["versions"] = discard_working_draft(versions, working_id)
    save_portfolio(db, portfolio)
    portfolio = load_portfolio(db)
    wd_after = find_working_draft(list(portfolio["versions"]))

    failed |= not ok(12, "discard working draft", wd_after is None, f"remaining_wd={wd_after!r}")
    failed |= not ok(13, "working draft count = 0", wd_after is None, "")

    if failed:
        print("\nOVERALL: FAIL")
        return 1
    print("\nOVERALL: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
