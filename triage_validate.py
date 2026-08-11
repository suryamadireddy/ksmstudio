"""Pure triage field validation — no Anthropic/Supabase imports."""

from __future__ import annotations

TIME_HORIZON_MAP = {
    "immediate": "immediate",
    "3mo": "3mo",
    "6mo": "6mo",
    "1yr": "1yr",
    "3yr+": "3yr+",
    "weeks": "immediate",
    "days": "immediate",
    "week": "immediate",
    "month": "3mo",
    "months": "3mo",
    "3 months": "3mo",
    "6 months": "6mo",
    "six months": "6mo",
    "year": "1yr",
    "years": "3yr+",
    "1 year": "1yr",
    "2 years": "3yr+",
    "3 years": "3yr+",
    "3+ years": "3yr+",
    "multi-year": "3yr+",
}

CATEGORY_DISPOSITION = {1: "pursue", 2: "potential", 3: "park", 4: "discard"}


def derive_category(effort: int, impact: int) -> int:
    if effort <= 2 and impact >= 3:
        return 1
    if effort >= 3 and impact >= 4:
        return 2
    if effort <= 2 and impact <= 2:
        return 3
    if effort >= 3 and impact <= 2:
        return 4
    # gap case (e.g. effort=3, impact=3): impact ≥ 3 → category 2, else 4
    return 2 if impact >= 3 else 4


def coerce_score(value, fallback: int = 3) -> int:
    """Coerce a triage score to an int in 1–5."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(1, min(5, n))


def validate_fields(idea_data: dict) -> dict:
    """
    Validate and correct category, disposition, and time_horizon before writing.
    Category is always recomputed from effort/impact (scores are source of truth);
    disposition is forced from that category. Returns a corrected copy.
    """
    data = dict(idea_data)

    effort = coerce_score(data.get("effort_score", 3))
    impact = coerce_score(data.get("impact_score", 3))
    data["effort_score"] = effort
    data["impact_score"] = impact

    derived = derive_category(effort, impact)
    cat = data.get("category")
    if cat != derived:
        print(
            f"\033[33m⚠ category value {cat!r} corrected to {derived} "
            f"from effort={effort}, impact={impact}\033[0m"
        )
    data["category"] = derived

    expected = CATEGORY_DISPOSITION[derived]
    disp = data.get("disposition")
    if disp != expected:
        print(
            f"\033[33m⚠ disposition {disp!r} corrected to {expected!r} "
            f"(category {derived})\033[0m"
        )
    data["disposition"] = expected

    th = data.get("time_horizon", "")
    mapped = TIME_HORIZON_MAP.get(str(th).lower().strip())
    if mapped is None:
        print(
            f"\033[33m⚠ time_horizon value {th!r} is not a valid enum — "
            f"defaulting to '6mo'\033[0m"
        )
        data["time_horizon"] = "6mo"
    elif mapped != th:
        print(
            f"\033[33m⚠ time_horizon value {th!r} mapped to '{mapped}'\033[0m"
        )
        data["time_horizon"] = mapped

    raw_ka = data.get("kill_assumptions", [])
    normalized = []
    for item in raw_ka:
        if isinstance(item, str):
            normalized.append({"text": item, "status": "untested"})
        elif isinstance(item, dict) and "text" in item:
            if "status" not in item:
                item["status"] = "untested"
            normalized.append(item)
    data["kill_assumptions"] = normalized

    return data
