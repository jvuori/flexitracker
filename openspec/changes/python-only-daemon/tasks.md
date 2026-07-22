> Order matters: capture the validated correctness (group 1) BEFORE deleting the
> Rust reference and the harness (group 2). The Python daemon is already built and
> proven equivalent to Rust across the 24 vectors, so the deletion is safe — but
> only once the vectors live with the daemon as its own regression tests.

## 1. Preserve the validated correctness before deleting anything

- [x] 1.1 Pure-Python daemon built in `daemon-py/` (state machine, outbox, sender, config, ctypes idle, CLI), byte-validated against the Rust reference across 24 conformance vectors (three-way green).
- [x] 1.2 Relocate `conformance/vectors/*.json` into `daemon-py/tests/vectors/` and add a data-driven pytest that drives each vector through the Python state machine, asserting the expected events and final state.
- [x] 1.3 Port any `state_machine.rs` unit assertions not already represented by a vector into `daemon-py/tests/`; confirm `uv run pytest` is green.

## 2. Remove the second implementation and the parity apparatus

- [x] 2.1 Delete `conformance/` (Docker harness, mock backend, three-way `run.py`, README) now that the vectors live with the daemon.
- [x] 2.2 Delete the Rust `conformance.rs` and its `__conform` wiring in `main.rs` (superseded).
- [x] 2.3 Delete the `daemon/` Rust workspace and its Rust-targeted install sources (systemd unit, `install.ps1`, Inno `.iss`).

## 3. Distribution: uv-first, frozen exe optional

- [x] 3.1 Bake the PROD backend URL into the wheel at build time (the `_backend.py` mechanism) so a user supplies only a key.
- [x] 3.2 Add a frozen single-file build (PyInstaller or Nuitka — decide per design Open Questions), excluding unused stdlib modules; produce a Windows exe and a Linux binary.
- [x] 3.3 Decide explicitly whether v1 ships the frozen exe / Windows `setup.exe` or starts uv-only (design Open Questions), and record the decision.

## 4. Auto-start install assets on the uv entrypoint

- [x] 4.1 Linux: a systemd *user* service + copy/paste installer that runs the uv-installed `flexitracker` windowless, enabled on login.
- [x] 4.2 Windows: a login task (Task Scheduler) launching the daemon windowless, with a documented `uv tool install` + auto-start one-liner.
- [x] 4.3 Document the SmartScreen trust step for the optional frozen-exe path.

## 5. CI and release around Python

- [x] 5.1 `ci.yml`: drop the Rust daemon job; add a Python daemon job (`uv sync` + `uv run pytest`, including the vectors); keep the backend job.
- [x] 5.2 `release.yml`: drop the cross-compiled Rust matrix; on a **published GitHub Release** build the wheel + sdist and the standalone executables, gated on the tests.
- [x] 5.3 Derive the version from the git tag with **hatch-vcs** (`dynamic = ["version"]`, `source = "vcs"`, `root = ".."`, `no-local-version`); the tag *is* the version, so the old tag-matches-version check is removed.
- [x] 5.4 Publish the wheel to **PyPI** via keyless OIDC trusted publishing, and attach the executables to the Release — no secret in the repo or CI logs.
- [x] 5.5 Implement `--version`: report the installed package version, or `0.0.0` for a development build (importlib.metadata; `--copy-metadata` bundles it into the frozen exe).
- [x] 5.6 Add a `/release` command and `release` skill: analyse daemon changes since the last tag, propose the next semver, and `gh release create` (which triggers the publish workflow). Tags are never pushed by hand.

## 6. Onboarding and docs

- [x] 6.1 `backend/src/ui/render.ts`: present `uv tool install` as the primary command with the frozen-exe download as the convenience option; update asset names/links.
- [x] 6.2 `docs/wire-schema.md`: replace the Rust sync target with Python (`daemon-py/src/flexitracker/core.py`) — now TS + Python.
- [x] 6.3 `CLAUDE.md`: update the stack line ("Daemon: Python"), the "Releasing the daemon" section (pyproject version, wheel/exe assets, uv install), and drop the Rust-specific pitfalls that no longer apply.

## 7. Verify end to end

- [x] 7.1 `uv run pytest` green (unit tests + the 24 vectors).
- [ ] 7.2 Run the Python daemon against the local stack (`--simulate`) and confirm a seeded day renders correctly in the web UI.
- [x] 7.3 `uv tool install` from the built wheel yields a working `flexitracker configure`/`test` on a clean environment with no compiler and no admin rights.
- [ ] 7.4 The frozen exe, if shipped, runs `configure`/`test` on a machine without Python installed.
