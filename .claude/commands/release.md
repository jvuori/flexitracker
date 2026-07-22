---
name: "Release"
description: Cut a new daemon release — analyze changes, pick the next semver, and create the GitHub Release that publishes the PyPI wheel + standalone executables.
category: Workflow
tags: [release, daemon, workflow]
---

Cut a new release of the FlexiTracker daemon by following the **`release`** skill.

**Input** (optional): an explicit version after the command (e.g. `/release 0.3.0`).
If omitted, analyze the daemon changes since the last tag and propose the next
semantic version.

Invoke the `release` skill now and follow its steps:

1. Verify preconditions (clean tree, on `master`, up to date; `gh` authenticated)
   and `git fetch --tags`.
2. Find the last tag and analyze what changed under `daemon-py/` since it —
   classifying wire-protocol/CLI/config changes as breaking, additive ones as
   features, and the rest as fixes.
3. Propose the next semver (confirm with the user; honor an explicit version arg).
4. Draft grouped release notes.
5. On the user's explicit go-ahead, `gh release create vX.Y.Z --target master …`,
   which creates the tag and triggers `release.yml` to publish the wheel to PyPI
   and attach the standalone executables to the Release.
6. Report the Release + workflow-run URLs and offer to watch the run.

Do not push tags by hand or edit any version string — the tag *is* the version
(hatch-vcs). Never run `gh release create` without explicit confirmation; it
publishes to PyPI.

$ARGUMENTS
