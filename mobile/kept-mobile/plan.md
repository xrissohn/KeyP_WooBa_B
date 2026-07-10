# Backend API 연동 계획

백엔드(Interest Radar API)와 kept-mobile 앱을 실제로 연결하기 위한 계획.
API 명세는 [`../../docs/API.md`](../../docs/API.md), 전체 스키마는 [`../../docs/openapi.yaml`](../../docs/openapi.yaml) 기준.

## 현재 상태

- API 레이어는 이미 존재: `shared/src/commonMain/kotlin/com/jetbrains/kmpapp/data/KeypApi.kt` (Ktor), `data/dto/KeypDtos.kt`, `data/Repositories.kt`, `di/Koin.kt`
- `Repositories.kt`의 `USE_MOCK_DATA = true` 때문에 모든 refresh/toggle/delete가 API를 건너뛰고 로컬 상태만 사용 중
- `SearchViewModel.submitMock()` / `SearchScreen`이 mock 등록 경로를 사용 중
- Koin의 HttpClient가 `http://10.0.2.2:3000` + `x-user-id: keyp-mobile-dev`로 하드코딩 — Android 에뮬레이터 전용이라 iOS 시뮬레이터에서는 연결 불가

## Endpoint ↔ 앱 매핑

| API | 앱 코드 | 상태 |
|---|---|---|
| `POST /v1/subscriptions` | `SearchViewModel.submit()` → `SubscriptionRepository.create()` | 구현됨, mock 경로가 대신 사용 중 |
| `GET /v1/subscriptions` | `HomeViewModel.refresh()` → `SubscriptionRepository.refresh()` | 구현됨, mock으로 skip |
| `PATCH /v1/subscriptions/{id}/status` | `HomeViewModel.toggleNotification()` | 구현됨, mock으로 skip |
| `DELETE /v1/subscriptions/{id}` | `HomeViewModel.delete()` | 구현됨, mock으로 skip |
| `GET /v1/events` | `FeedViewModel.refresh()` → `FeedRepository.refresh()` | 구현됨, cursor 영속화 없음 |
| `GET /v1/subscriptions/{id}` / `{id}/events` | `screens/detail` | 미구현 (후순위) |
| `POST/DELETE /v1/devices` | `DeviceRepository.setEnabled()` | 구현됨, FCM token 획득 없음 |
| `GET /health` | 없음 | 연결 확인용으로 추가 |

## 단계별 작업

### 1. 환경 설정 정리 (연결 준비)

- `di/Koin.kt`의 하드코딩된 host를 플랫폼별로 분리
  - Android 에뮬레이터: `10.0.2.2`, iOS 시뮬레이터: `localhost`, 실기기: 개발 머신 LAN IP
  - `expect/actual` 함수(예: `defaultApiHost()`)로 처리하거나 빌드 설정으로 주입
- `x-user-id`는 개발용 헤더이므로 상수로 유지하되 한 곳에서 관리 (`keyp-mobile-dev`)
- 백엔드 로컬 실행 후 `GET /health`로 연결 확인

### 2. Mock 모드 해제

- `Repositories.kt`: `USE_MOCK_DATA = false` 및 각 메서드의 mock 분기 제거
- `SubscriptionRepository.createMock()` 삭제, `SearchScreen`/`SearchViewModel`의 `submitMock()` 호출을 `submit()`으로 교체
- 실패 시 로컬 상태를 되돌리는 처리 확인 (`toggle`/`delete`는 현재 API 실패해도 로컬 상태를 바꿈 → API 성공 후에만 반영하도록 수정)

### 3. DTO 검증 및 보강

- `Json { ignoreUnknownKeys = true }`라서 현재 DTO(서버 응답의 부분집합)로도 파싱은 됨 — 필드명 일치 여부만 스키마와 대조
- `CreateSubscriptionResponse`에 `plan`(topic, sources, intervalSeconds), `planner`(ai/fallback) 추가 → 등록 성공 화면에서 "어떤 소스를 어떤 주기로 감시하는지" 보여줄 수 있음
  - `SearchPlan.sources`는 `provider` discriminator(oneOf: naver/x/rss/webhook) — kotlinx.serialization sealed class + `@JsonClassDiscriminator("provider")`로 매핑
- 에러 응답 DTO 추가: `validation_error`(details.fieldErrors), `request_error`(message), `not_found`

### 4. 이벤트 polling 정리 (`FeedRepository`)

- cursor 규칙 준수: 최초 `cursor=0`, 응답의 `nextCursor`를 다음 요청에 그대로 사용
- cursor를 메모리에만 두지 말고 영속화 (multiplatform-settings 또는 DataStore) — 앱 재시작 시 전체 이벤트 재수신 방지
- `hasMore=true`면 이어서 요청하는 루프 추가 (limit 기본 50, 최대 100)
- 화면 진입/pull-to-refresh 시 polling, 필요하면 foreground 주기 polling(예: 30–60초)은 후순위

### 5. 에러 처리 및 UX

- Ktor `HttpResponseValidator` 또는 repository 레벨에서 상태코드 매핑:
  - `400 validation_error` → 필드 에러 메시지 노출 (예: keyword 2자 미만)
  - `401` → 개발 단계에서는 헤더 누락 버그로 간주하고 로그
  - `404` → 목록 새로고침 (이미 삭제된 구독)
  - 네트워크 실패 → 재시도 안내 (기존 `SearchUiState.Error` 활용)
- `FeedViewModel.refresh()`의 `runCatching` 결과를 버리지 말고 `FeedUiState.Error`로 연결

### 6. 후순위

- **구독 상세**: `GET /v1/subscriptions/{id}` + `GET /v1/subscriptions/{id}/events`로 `screens/detail` 데이터 연결 (plan의 소스 목록, 구독별 이벤트)
- **FCM 연동**: androidApp/iosApp에서 실제 FCM token 획득 → `DeviceRepository.setEnabled()`로 `POST /v1/devices` (platform: `ios`/`android`). token 미획득 상태에서는 현재처럼 no-op
- **Webhook**: 서버 간 인터페이스(`x-webhook-secret`)라 앱에서는 미사용. 등록 응답의 `webhook.secret`은 생성 시 1회만 제공되므로 상세 화면에서 URL 안내 정도만 고려

## 검증

1. 백엔드 로컬 실행 (`http://localhost:3000`)
2. `curl http://localhost:3000/health`로 서버 확인
3. 앱에서 E2E 흐름: 관심사 등록 → 홈 목록 확인 → 일시정지/재개 → 피드 polling(첫 실행은 baseline이라 이벤트 없음에 유의) → 삭제
4. webhook source가 있는 구독이면 `curl -X POST /v1/webhooks/{id}/default -H 'x-webhook-secret: ...'`로 이벤트 주입 후 피드에 표시되는지 확인
