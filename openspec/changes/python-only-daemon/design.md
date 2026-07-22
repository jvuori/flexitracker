## Context

The daemon's observable contract is small and language-independent: the wire protocol (`docs/wire-schema.md`), the debounced/back-dating state machine, the durable outbox, the CLI (`configure`/`test`/run), and the on-disk config/state/outbox formats. A pure-Python implementation of all of it (`daemon-py/`) already exists and has been validated against the Rust reference across 24 conformance vectors (state-machine events + final state, three-way green). Measured runtime footprint: Rust ~2.5 MB resident, Python ~20–22 MB; idle CPU indistinguishable (both sleep 15 s, one syscall, a few microseconds of work). Disk and CPU are not constraints for this project, and there is no performance requirement.

This design retires the Rust daemon and the parity machinery, making Python the single implementation.

## Goals / Non-Goals

**Goals:**
- One daemon codebase (Python), so there is nothing to keep in sync and no divergence to referee.
- `uv`-first distribution that needs no compiled binary and no admin rights — the reason the Python daemon was built.
- Preserve the validated correctness: keep the 24 hand-verified behavioural vectors as the Python daemon's own regression tests.
- A frozen single-file exe as an *optional* convenience for non-blocked machines, without making the product depend on running an unsigned exe.

**Non-Goals:**
- Not keeping Rust "just in case" — that reintroduces the two-language tax this change exists to remove. Its logic is preserved in Python and proven equivalent; git history retains it if ever needed.
- Not chasing a 2.5 MB footprint. ~20 MB resident for an idle background poller is immaterial here.
- Not changing the backend, wire schema, CLI surface, or on-disk formats. This is an implementation/distribution change only.

## Decisions

### 1. Python is the single implementation; Rust is removed, not archived in-tree

The whole value of one implementation is that there is no second thing to maintain. Keeping the Rust workspace around "for reference" would keep it on the build/CI radar and invite drift. It is deleted from the working tree; git history is the archive. The Python port carries the same comments and structure, so the intent is preserved where a maintainer will actually look.

*Alternative considered — keep Rust as a reference implementation and retain the parity harness (Path A).* Rejected: its sole advantage over one implementation is a leaner native agent, which this project does not need, bought with a permanent two-language tax and a harness that still cannot cover the `ctypes` idle sensor or Windows without extra machinery. The parity harness already delivered its one high-value service (validating the port); past that it is pure cost.

### 2. The 24 vectors survive as Python regression tests, not as a parity contract

The vectors are hand-verified oracles for the trickiest behaviour (back-dating exactness, suspend reconciliation, the emit watermark, the return-to-work clock). Their value as a *behavioural* test does not depend on there being two implementations. They move under `daemon-py/tests/vectors/` and are driven by a data-driven pytest that runs each through the Python state machine and asserts the expected events + final state. What is deleted is the *three-way* apparatus: the Docker black-box harness, the cross-implementation diff in `run.py`, and both daemons' `__conform`/`--replay` modes — machinery whose only purpose was comparing two implementations.

### 3. Distribution is uv-first; the frozen exe is a secondary convenience

`uv tool install flexitracker` is the primary install on every OS: an 18 KB wheel, user-scope, no compiler, no admin — and the only path that actually clears a corporate exe block. For users on unrestricted machines who prefer a double-click installer, a **frozen single-file executable** is offered, and on Windows a `setup.exe` wrapping it. The freezing tool is a small decision (see Open Questions); the important architectural point is that the frozen exe is *downstream* of the wheel, never a parallel codebase.

*Alternative considered — make a frozen exe the primary artifact (like the Rust build was).* Rejected: a frozen onefile is a self-extracting unsigned exe — *more* likely to trip SmartScreen/AV than a plain binary, and it reintroduces exactly the barrier the uv path exists to avoid. It belongs as a convenience, not the headline.

### 4. Auto-start is rebuilt on the uv-installed entrypoint

The install assets that today target the Rust binary are reworked to target the `flexitracker` entrypoint that `uv tool install` puts on `PATH`:
- **Linux**: a systemd *user* service that runs the uv-installed `flexitracker`, enabled by a copy-paste installer.
- **Windows**: a login task (Task Scheduler) that launches the daemon windowless, plus the optional `setup.exe`.
The daemon still runs invisibly and starts on login; only the thing being launched changes from a bundled binary to the installed entrypoint.

### 5. The version is the git tag (hatch-vcs); publishing a Release triggers the build

The wheel version is derived from the git tag by **hatch-vcs** (`pyproject.toml`
declares `dynamic = ["version"]`, `[tool.hatch.version] source = "vcs"`), so the
tag *is* the version — there is no version string to bump and nothing to keep in
sync, which retires the old tag-matches-`Cargo.toml` gate entirely. Because the
package lives in a subdirectory, hatch-vcs is pointed at the repo root with
`raw-options = { root = ".." }`, and `local_scheme = "no-local-version"` keeps the
version PyPI-acceptable. An untagged (development) build resolves to a `…dev…`
version, which `flexitracker --version` reports as **`0.0.0`** so a dev run is
never mistaken for a release; a clean checkout at a tag reports exactly the tag.

`release.yml` triggers on **`release: published`**: publishing a GitHub Release
(via the `/release` command → `gh release create`, which creates the `vX.Y.Z`
tag) builds the wheel + sdist and the standalone executables. The wheel goes to
**PyPI via keyless OIDC trusted publishing** (no stored token), and the Windows +
Linux executables attach to the Release under stable asset names for the
onboarding download links. The PROD backend URL is baked into the wheel/exe at
build time (`_backend.py`, the Python equivalent of the Rust `option_env!`), so a
user still supplies only a key.

The release is driven by a first-class **`/release` command + `release` skill**:
it analyses the daemon changes since the last tag, proposes the next semver, and
creates the Release. Tags are never pushed by hand — the tag flows from the
Release, keeping the version, the wheel, and the executables identical.

## Risks / Trade-offs

- **Non-blocked users get a ~20 MB agent instead of ~2.5 MB** → accepted: immaterial for an idle background poller, and this project has no footprint requirement. Documented so the choice is explicit, not accidental.
- **Deleting a working, tested Rust daemon feels wasteful** → its behaviour is preserved in Python and *proven* equivalent by the 24 vectors before deletion; git history retains the source. The deletion is safe precisely because the parity work was done first.
- **A frozen unsigned exe trips SmartScreen/AV** → it is a secondary convenience, not the primary path; uv is the answer for restricted machines, and code signing (not packaging choice) is what actually clears SmartScreen for any unsigned artifact.
- **Losing the differential safety net for future state-machine changes** → mitigated by keeping the vectors as regression tests and by there being only one implementation to change; a bug can no longer hide as a *divergence*, only as a plain test failure, which the vectors and unit tests catch the same as before.
- **A corporate PyPI/registry mirror could block the wheel** just as an exe allow-list blocks a binary → keep the near-stdlib footprint (no third-party deps) so the install pulls almost nothing, and support installing directly from the GitHub-Release wheel, not only from an index.

## Migration Plan

Order matters so nothing is deleted before its value is captured:
1. Relocate `conformance/vectors/` into `daemon-py/tests/vectors/` and add the data-driven pytest; confirm all 24 pass against the Python state machine alone.
2. Port any remaining Rust unit assertions not already covered by a vector into `daemon-py/tests/`.
3. Delete `conformance/` (harness, three-way runner) and the Rust `__conform`/`--replay` code.
4. Delete the `daemon/` Rust workspace and its install sources.
5. Rework `ci.yml` (drop Rust job, add Python daemon job), `release.yml` (wheel + frozen exe, version from `pyproject.toml`), the auto-start install assets, `backend/src/ui/render.ts`, `docs/wire-schema.md`, and `CLAUDE.md`.

Rollback is `git revert` of the deletion commits — the Rust daemon returns intact. Nothing about the backend or an installed user changes mid-flight; existing installs keep working until replaced by the Python build.

## Resolved Decisions

- **Wheel distribution**: **PyPI** via keyless OIDC trusted publishing (primary,
  `uv tool install flexitracker`). One-time bootstrap: register the repo as a PyPI
  Trusted Publisher for the `flexitracker` project.
- **Ship a frozen exe in v1**: **yes** — a standalone single-file executable for
  Windows and Linux, attached to the GitHub Release, for machines that allow exes.
- **Freezing tool**: **PyInstaller** (mature, ubiquitous), onefile with unused
  stdlib excluded. Nuitka remains an option later if size/startup warrants it.
- **Version source**: **hatch-vcs** (the tag is the version); dev builds report `0.0.0`.
- **Release mechanism**: publishing a **GitHub Release** (`on: release: published`),
  cut via the `/release` command, triggers the publish workflow.

## Open Questions

- **Windows auto-start**: Task Scheduler login task (current) vs a `setup.exe`
  wrapping the frozen exe. The Task Scheduler one-liner covers the uv path; a
  `setup.exe` would only add a double-click installer for the exe path — defer
  until there is demand.
