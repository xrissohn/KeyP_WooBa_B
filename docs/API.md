# Interest Radar API 명세

전체 machine-readable 명세는 [openapi.yaml](./openapi.yaml)을 기준으로 합니다. OpenAPI 3.1을 지원하는 Swagger UI, Redoc, Postman 또는 타입 생성 도구에서 사용할 수 있습니다.

## 공통 규칙

- 개발 서버: `http://localhost:3000`
- 앱 API 설치 식별: `x-firebase-installation-id` header
- 운영 앱 검증: `x-firebase-appcheck` header
- Webhook 인증: `x-webhook-secret` header
- 날짜와 시각: ISO 8601 UTC 문자열
- 이벤트 cursor: 서버 내부 이벤트 ID. 응답의 `nextCursor`를 다음 요청에 전달
- 기본 page size: 50, 최대 100
- `204` 응답에는 body가 없음

FID는 Firebase 앱 설치 단위를 식별하며 인증 계정이 아닙니다. 최초 요청은 `PUT /v1/installations/current`여야 하며 운영 환경에서는 App Check token 검증을 활성화해야 합니다. FID가 회전하면 새 사용자로 취급됩니다.

## Endpoint 요약

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| `GET` | `/health` | 없음 | 서버 상태 확인 |
| `PUT` | `/v1/installations/current` | FID + App Check | 설치 및 선택적 FCM token 등록 |
| `GET` | `/v1/installations/current` | FID + App Check | 현재 설치 조회 |
| `DELETE` | `/v1/installations/current` | FID + App Check | 설치, 구독, FCM 연결 해제 |
| `POST` | `/v1/subscriptions` | FID + App Check | 관심사 등록 및 검색 계획 생성 |
| `GET` | `/v1/subscriptions` | FID + App Check | 내 구독 목록 |
| `GET` | `/v1/subscriptions/{id}` | FID + App Check | 활성 구독 상세 |
| `DELETE` | `/v1/subscriptions/{id}` | FID + App Check | 구독 soft delete |
| `PATCH` | `/v1/subscriptions/{id}/status` | FID + App Check | 구독 일시정지/재개 |
| `GET` | `/v1/subscriptions/{id}/events` | FID + App Check | 특정 구독 이벤트 polling |
| `GET` | `/v1/events` | FID + App Check | 전체 구독 이벤트 polling |
| `POST` | `/v1/devices` | FID + App Check | FCM token 등록 |
| `DELETE` | `/v1/devices` | FID + App Check | FCM token 해제 |
| `POST` | `/v1/webhooks/{subscriptionId}/{source}` | Webhook | 외부 이벤트 수신 |

검색 계획의 provider는 현재 `naver`, `x`, `rss`, `webhook`을 지원합니다.

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
