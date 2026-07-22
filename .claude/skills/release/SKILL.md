---
name: release
description: Cut a daemon release — analyze daemon changes since the last tag, suggest the next semver, and create a GitHub Release that triggers the publish workflow (PyPI wheel + standalone executables). Use when the user wants to release the daemon, publish a new version, or run /release.
license: MIT
metadata:
  author: flexitracker
  version: "1.0"
---

Cut a new release of the FlexiTracker daemon.

The version is derived from the git **tag** by hatch-vcs (see
`daemon-py/pyproject.toml`), so the tag *is* the version — there is no
`pyproject.toml` version to bump. Releasing means creating a **GitHub Release**
(which creates the `vX.Y.Z` tag); publishing it triggers `.github/workflows/release.yml`,
which builds the wheel → **PyPI** (keyless trusted publishing) and the standalone
Windows + Linux executables → attached to the **GitHub Release**.

**Never push tags by hand** and never edit a version string — always go through
`gh release create` so the tag, the wheel, and the executables stay identical.

## Steps

1. **Preconditions.**
   - Confirm `gh auth status` is authenticated and the repo has a remote.
   - Ensure the working tree is clean (`git status --porcelain` empty) and the
     current branch is `master` and up to date with `origin/master`
     (`git fetch origin && git status -sb`). If not, stop and tell the user —
     a release must come from a committed, pushed state (the tag will point at
     `origin/master`).
   - `git fetch --tags origin`.

2. **Find the last release.**
   - `git describe --tags --abbrev=0` (or `gh release list --limit 1`).
   - If there is no tag yet, treat the last version as `v0.0.0` and propose
     `v0.1.0` as the first release.

3. **Analyze what changed in the daemon since the last tag.**
   - `git log --no-merges <lastTag>..origin/master -- daemon-py/` for the commit
     subjects, and `git diff --stat <lastTag>..origin/master -- daemon-py/` for
     the shape of the change.
   - Classify each change by its effect on the daemon's **observable contract**,
     inspecting the diff of these files specifically:
     - **Breaking** — the wire protocol (`daemon-py/src/flexitracker/core.py`),
       a removed/renamed CLI command or flag (`cli.py`), or an
       incompatible config-file change (`config.py`).
     - **Feature** — a new CLI flag/command, a new event kind, a new capability
       (additive `cli.py` / `core.py` / new module).
     - **Fix / internal** — bug fixes, behaviour corrections in
       `state_machine.py`/`outbox.py`/`sender.py`, dependency, docs, tests.
   - If **nothing under `daemon-py/`** changed since the last tag, say so and ask
     the user whether to release anyway (e.g. a rebuild) before proceeding.

4. **Propose the next version (semver).**
   - Pre-1.0 (current `0.x`): a **breaking** change bumps the **minor**
     (`0.1.0 → 0.2.0`); a **feature** bumps the minor; **fix/internal** bumps the
     **patch** (`0.1.0 → 0.1.1`).
   - Post-1.0: **breaking → major**, **feature → minor**, **fix → patch**.
   - Use the **AskUserQuestion** tool to confirm, offering the computed bump first
     (labelled "Recommended") plus the other two levels, each showing the concrete
     resulting version. Let the user override.

5. **Draft the release notes.**
   - Group the commit subjects under `### Breaking`, `### Features`, `### Fixes`
     (omit empty groups). Keep them terse and user-facing. Note the install line
     at the top: `uv tool install flexitracker` (and the standalone-exe download).

6. **Create the release (this triggers the publish workflow).**
   - Show the user the final version and notes and get a clear go-ahead
     (this is outward-facing and hard to reverse — it publishes to PyPI).
   - `gh release create vX.Y.Z --target master --title "vX.Y.Z" --notes "<notes>"`.
     (Write the notes to a temp file and use `--notes-file` if they are long.)
   - This creates the tag + the published Release, which fires
     `release.yml` (`on: release: published`).

7. **Report and (optionally) watch.**
   - Print the Release URL (`gh release view vX.Y.Z --json url -q .url`).
   - Find the triggered run: `gh run list --workflow=release.yml --limit 1`, and
     offer to `gh run watch <id>` until it completes.
   - Remind the user that first-ever publish requires the one-time **PyPI Trusted
     Publisher** configuration for the `flexitracker` project, or the `wheel`
     job's publish step will fail.

## Guardrails

- The tag drives the version (hatch-vcs). Do **not** bump any version string or
  push a tag directly — only `gh release create`.
- Refuse to release from a dirty tree or a branch behind `origin/master`.
- Always get explicit confirmation before `gh release create` — it publishes to
  PyPI and cannot be truly un-published (a version number is burned even if yanked).
- If the user passes a version explicitly (e.g. `/release 0.3.0`), validate it is
  a clean semver greater than the last tag and use it instead of the computed one.
