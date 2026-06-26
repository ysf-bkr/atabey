# CI/CD Pipeline Standards (GitHub Actions)

> Automated quality gates and deployment pipelines.

## Overview

GitHub Actions CI/CD pipeline for automated testing, type-checking, and quality assurance.

## Pipeline Structure

```yaml
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

## Quality Gates

1. **TypeScript Check**: Zero type errors (`tsc --noEmit`)
2. **Lint Check**: ESLint must pass with zero warnings
3. **Unit Tests**: All tests must pass
4. **Coverage**: Minimum 80% line coverage

## Best Practices

1. Run tests on every push and pull request
2. Cache node_modules for faster builds
3. Use matrix builds for multi-version testing
4. Never deploy without passing quality gates
5. Keep pipeline runs under 10 minutes

> **Note**: Deployment is managed by the development team, not automated by this pipeline.
