"""Runtime version resolution.

The package version is derived from the git tag by hatch-vcs at build time and
read back here from the installed distribution metadata. A **development** build
(an untagged checkout, or a build between tags) reports ``0.0.0`` so the version
string unambiguously distinguishes a real release from a dev run.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version as _dist_version


def get_version() -> str:
    """Return the released version, or ``0.0.0`` for a development build.

    A version carrying a development marker (`dev`) or a local segment (`+…`),
    or a distribution with no metadata at all, is a development build.
    """
    try:
        v = _dist_version("flexitracker")
    except PackageNotFoundError:
        return "0.0.0"
    if "dev" in v or "+" in v:
        return "0.0.0"
    return v
