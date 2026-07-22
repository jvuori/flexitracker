## Why

The daemon exists so a locked-down corporate Windows — which blocks unsigned executables — can still capture activity, by installing a Python package with `uv` (a toolchain such environments increasingly permit). We first pursued this as a *second* implementation alongside the Rust reference, kept identical by a conformance harness. Building it surfaced the real trade-off: the only genuine advantage of the two-implementation design over a single one is a leaner native agent (~2.5 MB resident vs ~20 MB for CPython), and this project has **no** performance or footprint requirement — it polls once every 15 s and is idle the rest of the time. Against that, two implementations cost a permanent two-language tax on every change plus a bespoke parity harness that still cannot cover the platform sensor or Windows without more machinery.

So the honest architecture is **one** daemon, in Python. The parity work already did its most valuable job: the Python port was validated byte-for-byte against the Rust reference across all 24 behavioural vectors, so we can retire Rust with evidence, not hope, that Python reproduces it. Keeping one codebase removes the divergence problem entirely rather than refereeing it forever.

## What Changes

- **Python becomes the sole daemon implementation.** The pure-Python `daemon-py/` (already built and validated against the Rust reference) is the daemon; the Rust workspace `daemon/` is **removed**.
- **Distribution is uv-first.** `uv tool install` is the primary path on every OS (18 KB wheel, no admin, no compiler). For non-blocked machines that want a double-click install, a **frozen single-file executable** (PyInstaller/Nuitka) and a Windows `setup.exe` wrapping it are offered as a convenience — **not** the primary path, since the whole point is to avoid depending on running an unsigned exe.
- **The parity apparatus is retired.** The Docker black-box harness (`conformance/harness/`), the three-way `run.py`, the Rust `__conform`/`--replay` mode, and the whole `daemon-parity` capability go away — there is no second implementation to keep identical. The **24 hand-verified behavioural vectors are preserved** as the Python state machine's own regression tests (moved under `daemon-py/tests/`), so the correctness oracle survives the deletion.
- **CI and release are rebuilt around Python.** `ci.yml` drops the Rust job and gains a Python daemon test job (pytest + the vectors). `release.yml` drops the cross-compiled Rust matrix and instead publishes the wheel (and the frozen exe) from a tag, with the version enforced against `pyproject.toml` instead of `Cargo.toml`.
- **Onboarding and docs follow.** `backend/src/ui/render.ts` presents the `uv` command (primary) plus the frozen-exe download; `docs/wire-schema.md` and `CLAUDE.md` are updated to describe a Python daemon.
- **No change** to the backend, the wire schema, the observable CLI, the config/outbox formats, or the daemon's behaviour. Only the implementation language and its distribution change.

## Capabilities

### New Capabilities
<!-- none — this change removes a capability rather than adding one -->

### Modified Capabilities
- `activity-daemon`: the daemon is a single pure-Python implementation, distributed primarily via `uv` (no compiled binary, no admin rights) with a frozen executable as an optional convenience; the productized per-OS install path is reframed around that.
- `deployment-pipeline`: the tagged release builds and publishes the Python package (and frozen exe) instead of cross-compiled Rust binaries, with the version enforced against `pyproject.toml`.

## Impact

- **Removed**: the entire `daemon/` Rust workspace (state machine, outbox, sender, idle FFI, `conformance.rs`, Inno `setup.exe` sources) and `conformance/` (vectors relocated first, then the three-way runner and Docker harness deleted). This is the bulk of the change — a deletion, not new code.
- **Kept**: `daemon-py/` (the daemon) and the 24 vectors as Python regression tests.
- **Added**: a frozen-exe build step and per-OS auto-start install assets for the Python daemon (systemd user service invoking the uv-installed entrypoint; a Windows login task / `setup.exe`); a Python release+publish job.
- **Reworked**: `ci.yml`, `release.yml`, `backend/src/ui/render.ts`, `docs/wire-schema.md`, `CLAUDE.md`.
- **Cost**: none. Wheel publishing (PyPI trusted publishing or a GitHub-Release asset) and the frozen build both run on free GitHub Actions minutes; no Cloudflare resource changes. Consistent with the zero-cost constraint.
