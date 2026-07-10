# KeyP_WooBa_B

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
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | NAVER 검색 API |
| `X_BEARER_TOKEN` | X Recent Search API Bearer token |
| `DEFAULT_RSS_FEEDS` | AI가 선택할 수 있는 RSS URL allowlist |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM 서비스 계정 JSON 문자열 |
| `FIREBASE_PROJECT_ID` | Application Default Credentials 사용 시 프로젝트 ID |
| `FIREBASE_APP_CHECK_ENFORCED` | App Check token 필수 검증 여부, production 기본 `true` |
| `WORKER_CONCURRENCY` | 동시에 실행할 구독 수, 기본 5 |
| `*_MIN_INTERVAL_SECONDS` | 공급자별 동일 검색 계획의 최소 재호출 간격 |
| `*_DAILY_BUDGET` | 공급자 전체 일일 안전 호출량, 0은 제한 없음 |

NAVER 검색의 API HUB 이전으로 endpoint가 변경되면 `NAVER_SEARCH_BASE_URL`을 새 endpoint로 설정할 수 있습니다.

자격 증명이 없는 공급자는 AI 검색 계획과 fallback 계획에서 자동 제외됩니다. X 검색은 최근 게시물을 최대 100개씩 조회하고 author expansion으로 실제 게시물 URL을 구성합니다.

## API 흐름

전체 API 명세는 [docs/openapi.yaml](docs/openapi.yaml), 사람이 읽기 위한 요약은 [docs/API.md](docs/API.md)를 참고하십시오. OpenAPI 명세와 실제 Fastify route의 일치 여부는 CI에서 자동 검증합니다.

로그인 없이 Firebase Installation ID(FID)를 설치 단위 사용자 키로 사용합니다. 앱 재설치나 데이터 삭제로 FID가 바뀌면 기존 구독을 복구할 수 없으며 새 사용자로 취급됩니다. 운영 환경에서는 모든 앱 API 요청에 `x-firebase-appcheck`도 함께 전달해야 합니다.

### 1. Firebase 설치 및 FCM 토큰 등록

앱에서 Firebase Installations SDK로 FID를 조회한 후 최초 한 번 등록합니다. FCM token은 함께 등록하거나 이후 `/v1/devices`로 갱신할 수 있습니다.

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

특정 구독만 조회할 수도 있습니다.

```bash
curl 'http://127.0.0.1:3000/v1/subscriptions/SUBSCRIPTION_ID/events?cursor=0&limit=50' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123'
```

응답의 `nextCursor`를 저장하고 다음 요청에 사용합니다. cursor는 검색 API의 offset이 아니라 내부의 단조 증가 이벤트 ID이므로 응답 순위 변화에 영향을 받지 않습니다.

구독 목록은 `GET /v1/subscriptions`, 일시정지/재개는 다음 API를 사용합니다.

```bash
curl -X PATCH http://127.0.0.1:3000/v1/subscriptions/SUBSCRIPTION_ID/status \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"active":false}'
```

### 4. FCM 토큰 갱신

```bash
curl -X POST http://127.0.0.1:3000/v1/devices \
  -H 'content-type: application/json' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123' \
  -d '{"token":"FCM_REGISTRATION_TOKEN","platform":"android"}'
```

FCM token이 회전하면 같은 endpoint로 새 token을 등록합니다. 앱 설치 데이터 삭제 시 `/v1/installations/current`를 `DELETE`하면 해당 FID의 구독과 token이 모두 비활성화됩니다.

### 5. Webhook 이벤트 입력

```bash
curl -X POST http://127.0.0.1:3000/v1/webhooks/SUBSCRIPTION_ID/default \
  -H 'content-type: application/json' \
  -H 'x-webhook-secret: SUBSCRIPTION_SECRET' \
  -d '{"items":[{"id":"release-42","url":"https://example.com/releases/42","title":"Release 42","publishedAt":"2026-07-10T03:00:00.000Z"}]}'
```

## 신규 판정

각 polling 소스의 첫 성공 실행은 baseline으로 저장하고 알림하지 않습니다. 이후 처음 관측된 항목만 `subscription_events`에 visible 이벤트로 생성합니다. 명시된 `publishedAt`이 구독 생성 시각보다 과거이면 뒤늦게 검색된 문서로 보고 억제합니다.

```text
provider + external_id             전역 항목 중복 방지
subscription_id + item_id          구독별 이벤트 중복 방지
subscription_events.id             클라이언트 polling cursor
subscription_events.push_sent_at   FCM outbox 상태
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
