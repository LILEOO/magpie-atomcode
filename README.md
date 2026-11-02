# magpie-atomcode workspace

The AtomCode provider plugin lives in
[`packages/atomcode`](packages/atomcode/README.md). The package name is
`@magpie-community/opencode-atomcode-auth`, and the provider id remains
`atomcode`.

The directory layout mirrors `magpie-community/plugins`, so
`packages/atomcode` can be copied there without changing its imports or tests.

```sh
npm test
npm run test:bun
npm run test:coverage:enforce
npm run pack:check
```

Live validation is opt-in because it spends AtomCode quota:

```sh
ATOMCODE_LIVE=1 npm run test:live
```

See [`packages/atomcode/README.md`](packages/atomcode/README.md) and
[`packages/atomcode/README.zh-CN.md`](packages/atomcode/README.zh-CN.md).

Repository policies: [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`SECURITY.md`](SECURITY.md), and [`NOTICE.md`](NOTICE.md).
