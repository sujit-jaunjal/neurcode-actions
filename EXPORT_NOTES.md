# Export Notes

- profile: `action`
- source: private `neurcode` monorepo
- strategy: expose only prebuilt GitHub Action runtime artifacts
- excluded: CLI internals and other workspace package sources

Post-export validation:
```bash
pnpm oss:check
node scripts/oss-export-boundary-check.mjs . --profile=action
```
