"""JSON helpers shared by artifact parsing."""

from __future__ import annotations

import json
from typing import Any


def strip_json_line_comments(text: str) -> str:
    """
    Remove // line comments that appear outside of JSON strings.

    A naive ``re.sub(r"//[^\\n]*", "", text)`` also matches the ``//`` inside
    ``https://...`` and ``http://...`` URL strings, truncating values and
    breaking ``json.loads``.
    """
    result: list[str] = []
    in_string = False
    escape = False
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]

        if in_string:
            result.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue

        if ch == '"':
            in_string = True
            result.append(ch)
            i += 1
            continue

        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            # Skip through end of line; keep the newline itself.
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue

        result.append(ch)
        i += 1

    return "".join(result)


def loads_json_allowing_line_comments(text: str) -> Any:
    """
    Parse JSON, tolerating // comments outside strings.

    On failure after comment stripping, retry the original text, then raise.
    """
    stripped = strip_json_line_comments(text)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return json.loads(text)
