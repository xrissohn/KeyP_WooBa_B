# Interest Radar API 명세

전체 machine-readable 명세는 [openapi.yaml](./openapi.yaml)을 기준으로 합니다. OpenAPI 3.1을 지원하는 Swagger UI, Redoc, Postman 또는 타입 생성 도구에서 사용할 수 있습니다.

## 공통 규칙

- 개발 서버: `http://localhost:3000`
- 앱 API 설치 식별: 현재 임시 비활성화, 활성화 시 `x-firebase-installation-id` header
- 운영 앱 검증: 현재 임시 비활성화, 활성화 시 `x-firebase-appcheck` header
- Webhook 인증: `x-webhook-secret` header
- 날짜와 시각: ISO 8601 UTC 문자열
- 이벤트 cursor: 서버 내부 이벤트 ID. 응답의 `nextCursor`를 다음 요청에 전달
- 기본 page size: 50, 최대 100
- `204` 응답에는 body가 없음

현재 모든 헤더 없는 요청은 하나의 `ANONYMOUS_INSTALLATION_ID`로 처리됩니다. 이는 개발 편의를 위한 임시 모드이며 사용자 간 데이터 격리가 없습니다. FID 모드를 복구하면 최초 요청은 `PUT /v1/installations/current`여야 하고 App Check token도 함께 검증합니다.

## Endpoint 요약

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/health` | 없음 | 서버 상태 확인 |
| `PUT` | `/v1/installations/current` | FID + App Check | 설치 및 선택적 FCM token 등록 |
| `GET` | `/v1/installations/current` | FID + App Check | 현재 설치 조회 |
| `DELETE` | `/v1/installations/current` | FID + App Check | 설치, 구독, FCM 연결 해제 |
| `POST` | `/v1/subscriptions` | FID + App Check | 관심사 등록 및 검색 계획 생성 |
| `GET` | `/v1/subscriptions` | FID + App Check | 내 구독 목록 |
| `GET` | `/v1/subscriptions/{id}` | FID + App Check | 삭제되지 않은 구독 상세 |
| `DELETE` | `/v1/subscriptions/{id}` | FID + App Check | 구독과 feed를 사용자 화면에서 숨기는 soft delete |
| `PATCH` | `/v1/subscriptions/{id}/status` | FID + App Check | 알림 및 수집 일시정지/재개 |
| `GET` | `/v1/subscriptions/{id}/events` | FID + App Check | 특정 구독 이벤트 polling |
| `GET` | `/v1/events` | FID + App Check | 전체 구독 이벤트 polling |
| `GET` | `/v1/bookmarks` | FID + App Check | 북마크된 이벤트만 polling |
| `PATCH` | `/v1/events/{cursor}/bookmark` | FID + App Check | 이벤트 북마크 상태 변경 |
| `POST` | `/v1/devices` | FID + App Check | FCM token 등록 |
| `DELETE` | `/v1/devices` | FID + App Check | FCM token 해제 |
| `POST` | `/v1/webhooks/{subscriptionId}/{source}` | Webhook | 외부 이벤트 수신 |

검색 계획의 provider는 `naver`, `x`, `rss`, `ai_search`, `serpapi`, `youtube`, `webhook`을 지원합니다. 신규 후보는 원래 자연어 의도에 대한 관련도와 출처 신뢰도 AI 검증을 모두 통과해야 polling과 FCM에 노출됩니다. webhook 입력도 동일한 검증을 거칩니다.

`active=false`인 구독은 목록과 기존 feed에는 남지만 외부 수집, webhook 입력, 신규 feed 생성 및 FCM 전송을 하지 않습니다. 구독 삭제 시 `active=0`과 `deleted_at`을 기록하며 목록·상세·통합 feed에서 제외합니다. 관련 DB row와 기존 이벤트/아이템은 삭제하지 않습니다.

이벤트 polling endpoint는 `subscriptionId`, `provider`, `q`, `from`, `to`, `bookmarked` query로 필터링할 수 있습니다. `GET /v1/subscriptions/{id}/events`는 이미 특정 구독으로 고정되어 있으므로 나머지 item 필터만 함께 사용합니다.

## Polling 예시

```bash
curl 'http://localhost:3000/v1/events?cursor=0&limit=50' \
  -H 'x-firebase-installation-id: cFirebaseInstallationId123'
```

```json
{
  "events": [
    {
      "cursor": 41,
      "subscriptionId": "3f889f56-8ca4-4a06-a9e0-18d6701cb77e",
      "item": {
        "provider": "naver:news",
        "externalId": "item-id",
        "url": "https://example.com/news/1",
        "title": "새로운 소식",
        "publishedAt": "2026-07-10T03:00:00.000Z",
        "firstSeenAt": "2026-07-10T03:01:00.000Z"
      },
      "createdAt": "2026-07-10T03:01:00.000Z"
    }
  ],
  "nextCursor": 41,
  "hasMore": false
}
```

다음 요청에서는 `cursor=41`을 사용합니다. 결과가 비어 있으면 `nextCursor`는 요청 cursor와 동일합니다.
