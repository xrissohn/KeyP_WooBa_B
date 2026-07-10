# Interest Radar API

사용자가 등록한 관심사를 AI가 검색 계획으로 변환하고, 외부 검색 API와 RSS를 1분 간격으로 확인해 새 항목을 polling API와 FCM으로 전달하는 TypeScript 백엔드입니다.

## 제공 기능

- AI 기반 관심사 분석과 검증된 JSON 검색 계획
- AI 장애 또는 API 키 미설정 시 deterministic fallback 계획
- NAVER 뉴스/블로그/웹 검색 커넥터
- Google Custom Search JSON API 커넥터
- 사람인 채용 공고 API 커넥터
- RSS/Atom 커넥터와 private-network SSRF 차단
- secret 인증을 사용하는 외부 webhook 수신
- 소스별 최초 baseline 억제 및 게시일 기반 등록 이전 결과 억제
- 공급자 ID/URL 기반 중복 제거와 DB unique constraint
- cursor 기반 클라이언트 polling
- FCM push와 미발송 이벤트 재시도 outbox

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
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID` | Google Custom Search |
| `SARAMIN_ACCESS_KEY` | 사람인 채용 API |
| `DEFAULT_RSS_FEEDS` | AI가 선택할 수 있는 RSS URL allowlist |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM 서비스 계정 JSON 문자열 |
| `FIREBASE_PROJECT_ID` | Application Default Credentials 사용 시 프로젝트 ID |
| `WORKER_CONCURRENCY` | 동시에 실행할 구독 수, 기본 5 |

NAVER 검색의 API HUB 이전으로 endpoint가 변경되면 `NAVER_SEARCH_BASE_URL`을 새 endpoint로 설정할 수 있습니다.

## API 흐름

이 예제의 `x-user-id`는 인증 게이트웨이가 검증 후 넣어주는 사용자 식별자를 가정합니다. 인터넷에 직접 노출할 때는 JWT/session 인증 미들웨어로 교체해야 합니다.

### 1. 관심사 등록

```bash
curl -X POST http://127.0.0.1:3000/v1/subscriptions \
  -H 'content-type: application/json' \
  -H 'x-user-id: user-1' \
  -d '{"keyword":"서울 Java Spring 백엔드 개발자 채용"}'
```

응답에는 검증된 `plan`과 해당 구독 전용 webhook URL/secret이 포함됩니다. secret은 생성 응답에서만 클라이언트에 전달됩니다.

### 2. 이벤트 polling

```bash
curl 'http://127.0.0.1:3000/v1/subscriptions/SUBSCRIPTION_ID/events?cursor=0&limit=50' \
  -H 'x-user-id: user-1'
```

응답의 `nextCursor`를 저장하고 다음 요청에 사용합니다. cursor는 검색 API의 offset이 아니라 내부의 단조 증가 이벤트 ID이므로 응답 순위 변화에 영향을 받지 않습니다.

### 3. FCM 토큰 등록

```bash
curl -X POST http://127.0.0.1:3000/v1/devices \
  -H 'content-type: application/json' \
  -H 'x-user-id: user-1' \
  -d '{"token":"FCM_REGISTRATION_TOKEN","platform":"android"}'
```

### 4. Webhook 이벤트 입력

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
```

사람인은 `published_min/max`에 10분 overlap을 적용합니다. NAVER와 Google은 진짜 변경 cursor가 없으므로 최신 결과를 반복 수집하고 내부 unique constraint로 중복 제거합니다. 따라서 두 범용 검색 API만으로 원본 정보의 완전한 수집을 보장할 수는 없습니다.

## 검증

```bash
pnpm typecheck
pnpm test
```

현재 저장소는 단일 프로세스 MVP를 위해 Node 내장 SQLite를 사용합니다. 다중 인스턴스 운영에서는 PostgreSQL로 저장소를 이전하고, 워커는 Redis/BullMQ 또는 SQS 같은 lease 가능한 queue로 분리해야 동일 구독의 동시 실행을 방지할 수 있습니다.
