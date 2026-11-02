# Contributing

## Development

Requirements: Node.js 20+ and npm. Bun is optional but supported because magpie's plugin host uses it.

```bash
npm test
npm run test:bun
npm run test:coverage:enforce
npm run pack:check
```

The plugin package lives at `packages/atomcode`. The root is a private npm
workspace so the same layout can later be copied into
`magpie-community/plugins`.

Live tests consume real quota and require an explicit opt-in:

```bash
ATOMCODE_LIVE=1 npm run test:live
```

They are capped at nine requests, disable automatic claims, skip check-in, and
must not print account identifiers, tokens, prompts, or response content.

## Pull requests

- Follow TDD: add or update a failing test before implementation.
- Keep changes focused and use Conventional Commit style for commits.
- Preserve the single-export rule in `packages/atomcode/index.mjs`; OpenCode
  treats every export as a plugin entry.
- Do not weaken origin checks, response bounds, credential handling, or redirect restrictions without a security rationale and regression tests.
- Update both package READMEs for user-visible behavior.
- Never include real tokens, `plugin-auth.json`, OAuth state values, account IDs, or unredacted logs.
- Do not test against the real `$HOME`; use a temporary HOME for auth-file and
  Magpie sandbox tests.

## Protocol changes

Upstream protocols are unofficial and may change. Add an offline fixture for any new response shape and keep live-account probes manual and explicit because they consume quota.
