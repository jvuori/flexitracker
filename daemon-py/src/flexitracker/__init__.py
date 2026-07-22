"""FlexiTracker activity daemon — the pure-Python daemon.

Captures idle/active transitions and ships back-dated events to the backend.
The trickiest behaviour (back-dating, suspend reconciliation, the emit watermark)
is pinned by the behavioural vectors in `tests/vectors/`.

The version is derived from the git tag by hatch-vcs at build time; see
`version.get_version()` (reports 0.0.0 for a development build).
"""
