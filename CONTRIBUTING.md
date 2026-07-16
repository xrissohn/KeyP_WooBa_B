# Contributing to KeyP

Thank you for helping improve KeyP. Contributions of code, documentation, tests, connectors, translations, and reproducible bug reports are welcome.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Use an issue to discuss large changes before implementation.
- Do not include API keys, Firebase credentials, user data, or private URLs in issues, commits, fixtures, or logs.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development setup

KeyP requires Node.js 22.5 or later and pnpm.

```bash
git clone https://github.com/xrissohn/KeyP_WooBa_B.git
cd KeyP_WooBa_B
pnpm install
cp .env.example .env
pnpm dev
```

The backend can run without provider credentials by using its deterministic planning fallback. Add only the provider credentials needed for the connector you are testing.

## Quality checks

Run the same verification used by CI before submitting a pull request:

```bash
pnpm run ci
```

This command runs type checking, a production build, and tests with minimum coverage thresholds of 85% lines, 70% branches, and 75% functions.

## Pull requests

1. Create a focused branch from `main`.
2. Keep each pull request limited to one coherent change.
3. Add or update tests for behavior changes.
4. Update README, API documentation, OpenAPI, and `.env.example` when the public contract changes.
5. Describe the problem, solution, test evidence, security impact, and any migration steps.
6. Confirm that no secrets or personal data are included.

By contributing, you agree that your contribution will be licensed under the repository's MIT License.

---

# KeyP 기여 안내

코드, 문서, 테스트, 커넥터, 번역, 재현 가능한 버그 제보를 환영합니다. 큰 변경은 먼저 이슈에서 논의하고, 행동 변경에는 테스트를 추가해 주세요. PR 전 `pnpm run ci`를 실행하고 API 계약이 바뀌면 README, OpenAPI, 환경 변수 문서도 함께 수정해 주세요. 보안 취약점은 공개 이슈에 올리지 말고 [SECURITY.md](SECURITY.md)의 절차를 따라 주세요.
