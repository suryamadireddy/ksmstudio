"""Portfolio version activation helpers shared by distillation."""

from __future__ import annotations


def resolve_new_version_activation(
    prior_versions: list,
    current_active_id: str | None,
    version_id: str,
) -> tuple[str, str | None]:
    """Decide status and active_version_id for a newly distilled version.

    Spec: first version auto-activates; later versions stay draft/inactive
    until the user approves — even if the previous active pointer was cleared
    (e.g. after archiving the active version).
    """
    if not prior_versions:
        return "active", version_id
    return "draft", current_active_id
