"""Compare-and-swap helpers for ideas.portfolio JSONB writes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from portfolio_activation import resolve_new_version_activation

MAX_CAS_ATTEMPTS = 3


def portfolio_version_token(portfolio: dict | None) -> str | None:
    if not portfolio:
        return None
    token = portfolio.get("updated_at")
    return token if isinstance(token, str) and token else None


def append_distilled_version(
    portfolio: dict | None,
    new_version: dict,
    *,
    now: str | None = None,
) -> dict:
    """Append a distilled version onto the latest portfolio snapshot.

    Recomputes status/active_version_id from the *current* prior versions so a
    CAS retry after a concurrent branch/publish/activate cannot drop those
    writers' changes or incorrectly auto-activate a later draft.
    """
    stamp = now or datetime.now(timezone.utc).isoformat()
    current = dict(portfolio or {})
    prior_versions = list(current.get("versions") or [])
    version_id = new_version["id"]

    status, active_version_id = resolve_new_version_activation(
        prior_versions,
        current.get("active_version_id"),
        version_id,
    )

    version = dict(new_version)
    version["status"] = status
    if not version.get("parent_version_id") and prior_versions:
        version["parent_version_id"] = prior_versions[-1]["id"]

    updated = {
        **current,
        "versions": prior_versions + [version],
        "active_version_id": active_version_id,
        "updated_at": stamp,
    }
    return updated


def cas_append_distilled_version(
    db: Any,
    idea_id: str,
    new_version: dict,
    *,
    max_attempts: int = MAX_CAS_ATTEMPTS,
    now_factory: Callable[[], str] | None = None,
) -> dict:
    """Persist a new distilled version with compare-and-swap on updated_at."""
    last_error: Exception | None = None

    for _ in range(max_attempts):
        result = (
            db.table("ideas")
            .select("portfolio")
            .eq("id", idea_id)
            .single()
            .execute()
        )
        if not result.data:
            raise RuntimeError(f"No idea found with id {idea_id}")

        previous = result.data.get("portfolio")
        expected = portfolio_version_token(previous)
        stamp = (now_factory or (lambda: datetime.now(timezone.utc).isoformat()))()
        updated_portfolio = append_distilled_version(
            previous,
            new_version,
            now=stamp,
        )

        query = (
            db.table("ideas")
            .update({"portfolio": updated_portfolio})
            .eq("id", idea_id)
        )
        if previous is None:
            query = query.is_("portfolio", "null")
        elif expected:
            query = query.eq("portfolio->>updated_at", expected)
        # Legacy rows missing updated_at: best-effort write (stamps token).

        write_result = query.execute()
        if write_result.data:
            return updated_portfolio

        last_error = RuntimeError(
            "portfolio CAS conflict — concurrent writer won the race"
        )

    raise RuntimeError(
        f"Failed to persist portfolio version after {max_attempts} CAS attempts"
        + (f": {last_error}" if last_error else "")
    )
