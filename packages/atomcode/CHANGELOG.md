# Changelog

All notable changes to this project are documented here. The format follows
Keep a Changelog and the project uses semantic versioning.

## 0.2.0 - 2026-11-02

### Added

- Second sign-in method that reuses the official AtomCode CLI's
  `~/.atomcode/auth.toml`, validates private regular-file permissions, re-reads
  shared state before use, and atomically writes renewals back.
- Live model metadata for `deepseek-flash`, reasoning-effort variants, and
  model-level output-token limits.
- Token-oriented quota windows alongside every call-count window.
- Opt-in live smoke test capped at nine requests, with automatic claiming
  disabled and no token, prompt, or response-content output.
- Isolated tarball install/import CI smoke and release publication workflow for
  npm trusted publishing with provenance.

### Changed

- Package name and layout are migration-ready for
  `@magpie-community/opencode-atomcode-auth` under
  `magpie-community/plugins/packages/atomcode`.
- Minimum Magpie version is now `0.1.2563`; OpenCode loading remains supported
  but is explicitly experimental pending a real host-contract test.
- Endpoint overrides are restricted to the exact `acs.atomgit.com` and
  `api.gitcode.com` hosts on HTTPS port 443.
- Request bodies are normalized to replayable bytes, buffered with a 64 MiB
  cap, and signed after stream-usage serialization.
- Unknown quota values stay unknown instead of being reported as zero.

### Fixed

- A caller-owned `URL` can no longer be mutated between validation and dispatch
  to redirect signed traffic.
- Refresh results are cached by old and new refresh token, so persistence
  failures or a gap between renewal and save cannot trigger a second rotation.
- Gateway 401/403 responses force one refresh and retry; CLI-backed accounts
  persist the new credentials before the retry.
- Usage/check-in/claim work shares one request budget and one claim lock, with a
  bounded 18-second quota path.
- `auth.usage` returns `signIn: "expired"` on upstream credential failures.
- `remaining_days: null` no longer triggers a false plan re-claim.
- Special model names such as `__proto__` cannot alter the model result object's
  prototype.
- Upstream error bodies, invalid option values, emails, bearer tokens, and long
  secrets are redacted from logs and user-facing errors.

### Security

- OAuth, CodingPlan, and version response bodies remain bounded and redirects
  are refused.
- CLI auth files reject symlinks, non-regular files, and permissions wider than
  `0600`.
- The published package keeps zero runtime dependencies.
