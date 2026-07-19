## 1. Scope the trigger

- [x] 1.1 Add `paths-ignore` to the `push` trigger in `.github/workflows/deploy-qa.yml`: `openspec/**`, `docs/**`, `**/*.md`.
- [x] 1.2 Comment the block with *why it is a denylist* — an allowlist would silently stop deploying a newly added source directory, and the e2e that gates PROD would never run for it. Deploy unless proven inert.
- [x] 1.3 Note in the same comment that the exclusions assume nothing in the build reads Markdown, so a generated docs site or Markdown compiled into the UI would require narrowing them.
- [x] 1.4 Leave `ci.yml` (pull requests, `workflow_call`), `deploy-prod.yml` (manual dispatch) and `release.yml` (tag) untouched, and leave the jobs, e2e gate, PROD promotion and `cancel-in-progress: false` queueing unchanged.

## 2. Verify

- [x] 2.1 Confirm the workflow YAML still parses and the trigger is the only edited stanza (`git diff` shows nothing but the `on:` block).
- [ ] 2.2 Push a documentation-only commit and confirm no pipeline run starts.
- [ ] 2.3 Confirm on the next code-touching push that the pipeline runs as before, end to end through the PROD promotion — the property that must not regress.
- [ ] 2.4 Sanity-check a mixed commit (documentation + code) triggers a run, since that is the case an intuitive misreading of `paths-ignore` would get wrong.
