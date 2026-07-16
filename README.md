# KeyP — Open Interest Radar

[![CI](https://github.com/xrissohn/KeyP_WooBa_B/actions/workflows/ci.yml/badge.svg)](https://github.com/xrissohn/KeyP_WooBa_B/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/xrissohn/KeyP_WooBa_B)](https://github.com/xrissohn/KeyP_WooBa_B/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/xrissohn/KeyP_WooBa_B)](https://github.com/xrissohn/KeyP_WooBa_B/forks)

**Turn a natural-language interest into a cost-aware monitoring plan, collect only new information, verify relevance and source credibility, and deliver the result through an API or push notification.**

KeyP is an early-stage open-source reference implementation for personalized information-monitoring agents. It combines a TypeScript/Fastify backend with a Kotlin Multiplatform mobile client and keeps AI optional: when an AI endpoint or credential is unavailable, deterministic planning still provides a testable local workflow.

> **Project status:** Alpha. The public repository was opened in July 2026. Adoption metrics will be reported from verifiable GitHub releases and deployments as the community grows.

[한국어 상세 문서로 이동](#한국어-상세-문서)

## Why KeyP

Most monitoring products are tied to one source, poll every user independently, or send every match without validating whether it is genuinely new and relevant. KeyP provides reusable building blocks for developers creating job, grant, event, product-release, regulatory-change, news, or niche-topic monitoring services:

- provider-aware plans generated from natural language;
- deterministic fallback behavior for local development and AI outages;
- NAVER, X, RSS/Atom, grounded AI search, SerpAPI, YouTube, and webhook connectors;
- source-level baseline suppression and publication-time checks;
- provider ID and canonical URL deduplication backed by database constraints;
- shared source caching, minimum polling intervals, and daily provider budgets;
- batched relevance and source-credibility review with fail-closed filtering;
- monotonic cursor feeds, bookmarks, FCM delivery tracking, and retry outbox;
- OpenAPI 3.1 documentation and contract tests;
- CI-enforced thresholds of 85% line, 70% branch, and 75% function coverage.

## Architecture

| Layer | Responsibility |
| --- | --- |
| Planner | Converts a natural-language interest into validated source plans |
| Connectors | Collects candidates from search APIs, RSS/Atom, and webhooks |
| Review | Scores relevance and source credibility before user-visible delivery |
| Storage | Maintains subscriptions, baselines, deduplication, cursors, and budgets |
| Worker | Schedules shared collection with leases and provider safety limits |
| Delivery | Exposes polling APIs and sends FCM notifications through an outbox |
| Mobile | Provides Kotlin Multiplatform Android/iOS client foundations |

The backend runs as one process for the local MVP and can split into API and worker roles. Multi-instance production deployments should replace local SQLite coordination with PostgreSQL and a lease-capable queue such as Redis/BullMQ or SQS.

## Quick start

Requirements: Node.js 22.5 or later and pnpm.

```bash
git clone https://github.com/xrissohn/KeyP_WooBa_B.git
cd KeyP_WooBa_B
pnpm install
cp .env.example .env
pnpm dev
```

The API starts at `http://127.0.0.1:3000`. Provider credentials are optional for the local planning, webhook, and polling flow. Add only the credentials required for the connectors you want to test.

```bash
curl http://127.0.0.1:3000/health

curl -X POST http://127.0.0.1:3000/v1/subscriptions \
  -H 'content-type: application/json' \
  -d '{"keyword":"Open-source AI maintainer programs"}'
```

## Production security warning

The example configuration currently sets Firebase installation identity and App Check enforcement to `false` for local integration work. In that mode, unauthenticated requests share one anonymous installation identity and therefore do **not** provide user-level data isolation.

Do not expose the anonymous mode to the public internet. Before a shared or production deployment, enable both controls, configure Firebase Admin credentials through a secret manager, use TLS, rotate webhook secrets, and review [SECURITY.md](SECURITY.md).

## Documentation

- [Human-readable API guide](docs/API.md)
- [OpenAPI 3.1 specification](docs/openapi.yaml)
- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog and release notes](CHANGELOG.md)

## Development

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm run ci
```

Pull requests should include tests for behavior changes and update the README, OpenAPI specification, API guide, and `.env.example` whenever the public contract changes. See [CONTRIBUTING.md](CONTRIBUTING.md) and use the repository's issue templates for bugs and feature proposals.

## Roadmap

- Restore mandatory Firebase Installation ID and App Check verification for shared deployments
- Add PostgreSQL storage and a distributed queue adapter
- Publish reproducible Docker and GitHub Release artifacts
- Add more regional and domain-specific connectors
- Expand mobile testing and release automation
- Publish transparent adoption and reliability metrics

## License

KeyP is available under the [MIT License](LICENSE).

---

## 한국어 상세 문서

관심사를 KeyP하세요.

## Interest Radar API

사용자가 등록한 관심사를 AI가 검색 계획으로 변환하고, 외부 검색 API와 RSS에서 새 항목을 수집해 polling API와 FCM으로 전달하는 TypeScript 백엔드입니다. 구독은 1분 단위로 확인하되 실제 외부 호출은 공급자별 최소 주기와 일일 예산을 따릅니다.

## 제공 기능

- AI 기반 관심사 분석과 검증된 JSON 검색 계획
- AI 장애 또는 API 키 미설정 시 deterministic fallback 계획
- NAVER 뉴스/블로그/웹 검색 커넥터
- X Recent Search API 커넥터
- RSS/Atom 커넥터와 private-network SSRF 차단
- secret 인증을 사용하는 외부 webhook 수신
- 소스별 최초 baseline 억제 및 게시일 기반 등록 이전 결과 억제
- 공급자 ID/URL 기반 중복 제거와 DB unique constraint
- 동일 검색 계획의 공유 캐시와 공급자별 일일 호출 예산
- 구독별 및 사용자 통합 cursor polling
- FCM 토큰별 전달 상태, 500개 단위 batch와 재시도 outbox
- 구독 목록/일시정지/재개 및 디바이스 해제
- Firebase Installation ID 기반 로그인 없는 설치 식별과 App Check 검증
- Perplexity/Gemini/xAI 우선순위 기반 grounded AI 검색
- SerpAPI 웹 검색과 YouTube 최신 영상 검색
- 신규 후보의 AI 관련도·출처 신뢰도 배치 검증 및 fail-closed 알림 필터

## 실행

Node.js 22.5 이상이 필요합니다.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

기본 주소는 `http://127.0.0.1:3000`이며 외부 키 없이도 관심사 등록, webhook, 클라이언트 polling을 시험할 수 있습니다. 검색 커넥터는 해당 환경 변수가 있어야 성공합니다.

## 환경 변수

`.env.example`에 전체 목록이 있습니다. 중요한 값은 다음과 같습니다.

| 변수 | 용도 |
|---|---|
| `AI_API_KEY` | OpenAI-compatible Chat Completions API 키 |
| `AI_REVIEW_*` | AI 검증 활성화, 필수 여부, 관련도·신뢰도 임계값 |
| `AI_SEARCH_ENGINES` | `perplexity,gemini,xai` 검색 fallback 우선순위 |
| `PERPLEXITY_API_KEY` | Perplexity Sonar grounded search |
| `GEMINI_API_KEY` | Gemini Google Search grounding |
| `XAI_API_KEY` | Grok web search fallback |
| `SERPAPI_API_KEY` | SerpAPI Google 검색 |
| `YOUTUBE_API_KEY` | YouTube Data API 검색 전용 키 |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | NAVER 검색 API |
| `X_BEARER_TOKEN` | X Recent Search API Bearer token |
| `DEFAULT_RSS_FEEDS` | AI가 선택할 수 있는 RSS URL allowlist |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM 발송용 Firebase Admin 서비스 계정 JSON 문자열 |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | FCM 발송용 Firebase Admin 서비스 계정 JSON 파일 경로 |
| `FIREBASE_PROJECT_ID` | Application Default Credentials 또는 명시적 project override |
| `FIREBASE_APP_CHECK_ENFORCED` | App Check token 필수 검증 여부, 현재 기본 `false` |
| `FIREBASE_INSTALLATION_IDENTITY_ENABLED` | FID 기반 데이터 격리 사용 여부, 현재 기본 `false` |
| `ANONYMOUS_INSTALLATION_ID` | FID 비활성화 중 모든 요청에 사용하는 임시 ID |
| `WORKER_CONCURRENCY` | 동시에 실행할 구독 수, 기본 5 |
| `*_MIN_INTERVAL_SECONDS` | 공급자별 동일 검색 계획의 최소 재호출 간격 |
| `*_DAILY_BUDGET` | 공급자 전체 일일 안전 호출량, 0은 제한 없음 |

NAVER 검색의 API HUB 이전으로 endpoint가 변경되면 `NAVER_SEARCH_BASE_URL`을 새 endpoint로 설정할 수 있습니다.

자격 증명이 없는 공급자는 AI 검색 계획과 fallback 계획에서 자동 제외됩니다. AI 검색 엔진은 `AI_SEARCH_ENGINES` 순서대로 시도하고 첫 성공 결과만 사용해 중복 호출을 줄입니다. Google AI Studio/Gemini 키와 YouTube Data API 키는 서로 다른 API 제한을 적용한 별도 키 사용을 권장합니다.

EC2 배포에서는 SQLite 파일이 배포 디렉토리 초기화에 같이 삭제되지 않도록 `DATABASE_PATH`를 release 경로 밖의 영속 디렉토리로 지정하십시오. 예: `DATABASE_PATH=/var/lib/keyp/radar.sqlite`. 로컬 기본값인 `./data/radar.sqlite`와 SQLite sidecar 파일(`*.sqlite-wal`, `*.sqlite-shm`)은 git에서 무시됩니다.

## API 흐름

전체 API 명세는 [docs/openapi.yaml](docs/openapi.yaml), 사람이 읽기 위한 요약은 [docs/API.md](docs/API.md)를 참고하십시오. OpenAPI 명세와 실제 Fastify route의 일치 여부는 CI에서 자동 검증합니다.

현재는 연동 개발을 위해 FID와 App Check 검증을 임시 비활성화했습니다. 일반 앱 API는 인증 헤더 없이 호출할 수 있고 모든 요청은 `ANONYMOUS_INSTALLATION_ID` 한 개로 처리됩니다. 따라서 여러 실제 사용자가 접속하면 구독과 feed가 서로 노출되므로 외부 공개 환경에서는 사용하면 안 됩니다. 복구 시 `FIREBASE_INSTALLATION_IDENTITY_ENABLED=true`와 `FIREBASE_APP_CHECK_ENFORCED=true`를 설정합니다.

### 1. Firebase 설치 및 FCM 토큰 등록

현재 임시 익명 모드에서는 이 단계와 두 Firebase header를 생략할 수 있습니다. FID 모드를 다시 켠 경우 앱에서 Firebase Installations SDK로 FID를 조회한 후 최초 한 번 등록합니다.

```bash
curl -X PUT http://127.0.0.1:3000/v1/installations/current \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"platform":"android","fcmToken":"FCM_REGISTRATION_TOKEN_AT_LEAST_20_CHARS"}'
```

### 2. 관심사 등록

```bash
curl -X POST http://127.0.0.1:3000/v1/subscriptions \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"keyword":"서울 Java Spring 백엔드 개발자 채용"}'
```

응답에는 검증된 `plan`과 해당 구독 전용 webhook URL/secret이 포함됩니다. secret은 생성 응답에서만 클라이언트에 전달됩니다.

### 3. 이벤트 polling

사용자의 모든 구독을 한 cursor로 조회하는 API가 클라이언트의 기본 polling endpoint입니다.

```bash
curl 'http://127.0.0.1:3000/v1/events?cursor=0&limit=50' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123'
```

이벤트는 cursor 단위로 북마크할 수 있고, 북마크된 이벤트만 별도로 조회할 수 있습니다.

```bash
curl -X PATCH http://127.0.0.1:3000/v1/events/EVENT_CURSOR/bookmark \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"bookmarked":true}'

curl 'http://127.0.0.1:3000/v1/bookmarks?cursor=0&limit=50' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123'
```

특정 구독만 조회할 수도 있습니다.

```bash
curl 'http://127.0.0.1:3000/v1/subscriptions/SUBSCRIPTION_ID/events?cursor=0&limit=50' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123'
```

응답의 `nextCursor`를 저장하고 다음 요청에 사용합니다. cursor는 검색 API의 offset이 아니라 내부의 단조 증가 이벤트 ID이므로 응답 순위 변화에 영향을 받지 않습니다.

이벤트 조회는 `subscriptionId`, `provider`, `q`, `from`, `to`, `bookmarked` query로 필터링할 수 있습니다. 예를 들어 특정 구독의 북마크된 NAVER 뉴스만 보려면 `/v1/events?subscriptionId=SUBSCRIPTION_ID&provider=naver%3Anews&bookmarked=true`처럼 호출합니다.

구독 목록은 `GET /v1/subscriptions`, 알림 OFF/ON은 다음 API를 사용합니다. `active=false`인 동안에는 해당 구독의 외부 수집, webhook 입력, 신규 feed 생성과 FCM 전송이 모두 중지되며 기존 feed는 유지됩니다.

```bash
curl -X PATCH http://127.0.0.1:3000/v1/subscriptions/SUBSCRIPTION_ID/status \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"active":false}'
```

`DELETE /v1/subscriptions/SUBSCRIPTION_ID`는 soft delete입니다. 스케줄러와 전송을 중지하고 구독과 feed를 사용자 API에서 즉시 숨기지만, 구독·수집 이벤트·아이템은 DB에 보존합니다.

### 4. FCM 토큰 갱신

```bash
curl -X POST http://127.0.0.1:3000/v1/devices \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"token":"FCM_REGISTRATION_TOKEN","platform":"android"}'
```

FCM token이 회전하면 같은 endpoint로 새 token을 등록합니다. 앱 설치 데이터 삭제 시 `/v1/installations/current`를 `DELETE`하면 해당 FID의 구독과 token이 모두 비활성화됩니다.

백엔드에서 FCM을 발송하려면 Firebase Admin SDK용 서비스 계정 키가 필요합니다. Firebase Console의 Project settings > Service accounts에서 새 private key를 발급하고, `FIREBASE_SERVICE_ACCOUNT_JSON` 또는 `FIREBASE_SERVICE_ACCOUNT_PATH`로 전달합니다. Android 앱용 `google-services.json`에는 `private_key`가 없어서 서버 발송에 사용할 수 없습니다.

### 5. Webhook 이벤트 입력

```bash
curl -X POST http://127.0.0.1:3000/v1/webhooks/SUBSCRIPTION_ID/default \
  -H 'content-type: application/json' \
  -H 'x-webhook-secret: SUBSCRIPTION_SECRET' \
  -d '{"items":[{"id":"release-42","url":"https://example.com/releases/42","title":"Release 42","publishedAt":"2026-07-10T03:00:00.000Z"}]}'
```

## 신규 판정

각 polling 소스의 첫 성공 실행은 baseline으로 저장하고 알림하지 않습니다. 이후 처음 관측된 후보만 OpenAI structured output 검증에 전달합니다. 원래 자연어 의도와의 관련도, 출처·도메인·게시 형태에 기반한 신뢰도 점수가 서버 임계값을 모두 통과한 항목만 visible 이벤트와 FCM 알림이 됩니다. 명시된 `publishedAt`이 구독 생성 시각보다 과거이면 AI 호출 없이 억제합니다.

```text
provider + external_id             전역 항목 중복 방지
subscription_id + item_id          구독별 이벤트 중복 방지
subscription_events.id             클라이언트 polling cursor
subscription_events.push_sent_at   FCM outbox 상태
subscription_events.review_*        AI 검증 점수, 판정 근거와 모델
push_deliveries(event_id, token)    디바이스별 FCM 전달 상태
source_cache.source_key             동일 검색 계획의 공유 수집 결과
provider_usage(provider, day)       공급자 전체 일일 호출량
```

일반 감시는 공급자별 최신 첫 페이지만 수집합니다. X는 마지막 성공 시각보다 2분 이전부터 겹쳐 조회하고, NAVER는 최신 결과를 반복 수집합니다. 중복은 내부 unique constraint로 제거하지만 범용 검색 API만으로 원본 정보의 완전한 수집을 보장할 수는 없습니다.

API와 worker는 기본적으로 한 프로세스에서 실행되며 운영 시 분리할 수 있습니다.

```bash
pnpm start:api
pnpm start:worker
```

여러 worker가 같은 SQLite 파일을 공유하더라도 만료 가능한 scheduler lease로 동일 구독의 중복 실행을 방지합니다. 여러 서버에 걸친 운영은 PostgreSQL과 외부 queue로 이전해야 합니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm run ci
```

`pnpm run ci`는 typecheck, build, 전체 테스트를 순서대로 실행합니다. Coverage 기준은 line 85%, branch 70%, function 75%이며 기준 미달 시 실패합니다. GitHub Actions는 `main`, `develop`, `backend` push와 `main`, `develop` 대상 pull request에서 같은 명령을 실행합니다.

현재 저장소는 단일 프로세스 MVP를 위해 Node 내장 SQLite를 사용합니다. 다중 인스턴스 운영에서는 PostgreSQL로 저장소를 이전하고, 워커는 Redis/BullMQ 또는 SQS 같은 lease 가능한 queue로 분리해야 동일 구독의 동시 실행을 방지할 수 있습니다.


## 커뮤니티와 라이선스

버그와 기능 제안은 GitHub 이슈 템플릿을 사용해 주세요. 코드 기여 전 [CONTRIBUTING.md](CONTRIBUTING.md)를 확인하고, 보안 취약점은 공개 이슈가 아니라 [SECURITY.md](SECURITY.md)의 비공개 절차로 신고해 주세요. 이 프로젝트는 [MIT License](LICENSE)로 배포됩니다.
