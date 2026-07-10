# 북마크 탭 전환 + 키워드 피드 화면 구현 계획

## 요구사항

1. 바텀 네비게이션의 **마이페이지 탭 → 북마크 탭**으로 변경 (아이콘도 북마크 모양)
2. 기존 마이페이지 내용 전부 제거
3. 북마크 화면에는 **관심사 피드에서 북마크한 항목만** 모아서 표시
4. 북마크 기능은 backend API 문서(`../../docs/API.md`, `../../docs/openapi.yaml`) 스펙대로 서버 연동
5. 홈 화면에서 관심사 카드를 누르면 **해당 키워드의 피드만 보이는 화면** 추가
6. 어느 화면이든 로딩 중일 때 **서클 로딩바(CircularProgressIndicator)** 표시

## Backend API 확인 결과 (`docs/openapi.yaml` 기준)

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/v1/bookmarks` | 북마크된 이벤트만 cursor 페이징 조회 (`cursor`, `limit`, 필터 query) |
| `PATCH` | `/v1/events/{cursor}/bookmark` | body `{ "bookmarked": true/false }` → `204` 응답 |
| `GET` | `/v1/subscriptions/{id}/events` | 특정 구독(키워드)의 이벤트만 cursor 페이징 조회 |

- 모든 요청에 `x-firebase-installation-id` 헤더 (기존 `KtorKeypApi` 패턴과 동일)
- `Event` 스키마에 `bookmarked: boolean`이 **required 필드**로 존재
  → 현재 모바일 `EventDto`에는 이 필드가 없어서 추가 필요
- `/v1/bookmarks` 응답은 `EventPage`(`events`, `nextCursor`, `hasMore`) — 기존 `EventsPageDto` 재사용 가능
- 현재 `FeedRepository.toggleBookmark()`는 **로컬 상태만 바꾸고 서버에 저장하지 않음** → API 연동으로 교체

## 현재 구조 요약

- `App.kt`: `home / feed / mypage / search / settings` 라우트, `KeypBottomBar`는 탭 3개(`feed`, `home`, `mypage`)
- `KeypBottomBar`(`ui/components/KeypComponents.kt`): 마이페이지는 `Icons.Default.Person` + "마이페이지"
- `MyPageScreen/MyPageViewModel`: 사용자 카드, 푸시 알림 토글, 관심사 관리, 앱 버전 → 전부 제거 대상
  (푸시 알림 토글은 `NotificationSettingsScreen`에 이미 있으므로 기능 유실 없음)
- 로딩 UI 현황: `FeedScreen`만 `CircularProgressIndicator` 사용. Home 초기 로딩은 아무 표시 없음, Search 제출 중은 텍스트("분석 중...")만 표시

## 구현 단계

### 1단계 — 데이터 계층 (서버 연동)

**`data/dto/KeypDtos.kt`**
- `EventDto`에 `bookmarked: Boolean = false` 추가
- `UpdateBookmarkRequest(val bookmarked: Boolean)` 추가

**`data/KeypApi.kt`** — 3개 메서드 추가
```kotlin
suspend fun listBookmarks(cursor: Long?, limit: Int = 50): EventsPageDto      // GET /v1/bookmarks
suspend fun updateBookmark(cursor: Long, bookmarked: Boolean)                 // PATCH /v1/events/{cursor}/bookmark
suspend fun listSubscriptionEvents(id: String, cursor: Long?, limit: Int = 50): EventsPageDto  // GET /v1/subscriptions/{id}/events
```

**`data/Repositories.kt`**
- `FeedRepository.refresh()`: 이벤트 매핑 시 서버의 `bookmarked` 값을 `FeedItem.bookmarked`에 반영
- `FeedRepository.toggleBookmark(id)` → `suspend`로 변경:
  1. 낙관적 로컬 토글 (즉시 UI 반영)
  2. `PATCH /v1/events/{cursor}/bookmark` 호출
  3. 실패 시 롤백 + 에러 전달
- `BookmarkRepository` 신설: `GET /v1/bookmarks`를 cursor=0부터 `hasMore` 끝까지 페이징해서 전체 북마크 목록 보관
  - 피드 화면은 세션 중 수집한 이벤트만 갖고 있으므로, 북마크 탭은 서버 전체 조회가 필요해서 별도 저장소로 분리
  - 피드에서 북마크 토글 시 북마크 목록에도 추가/제거 반영 (양방향 동기화)

**`di/Koin.kt`**: `BookmarkRepository` single 등록, `MyPageViewModel` 제거, `BookmarksViewModel`·`KeywordFeedViewModel` 등록

### 2단계 — 북마크 화면 (마이페이지 대체)

- `screens/mypage/MyPageScreen.kt`, `MyPageViewModel.kt` **삭제**
- `screens/bookmarks/BookmarksScreen.kt`, `BookmarksViewModel.kt` 신규
  - 상태: `Loading / Content(items) / Error(message)` (FeedViewModel 패턴 동일)
  - 진입 시 + 새로고침 버튼으로 `BookmarkRepository.refresh()` 호출
  - 카드 UI는 피드 카드와 동일 (채워진 북마크 아이콘), 토글로 북마크 해제 시 목록에서 제거
  - 빈 상태: "북마크한 소식이 없어요"
- **피드 카드 컴포넌트 추출**: `FeedScreen`의 카드를 `ui/components/FeedItemCard.kt`로 분리해서 피드/북마크/키워드 피드 3개 화면에서 재사용

### 3단계 — 바텀 네비게이션 변경

- `KeypComponents.kt`의 `KeypBottomBar`:
  - `"mypage" to "마이페이지"` → `"bookmarks" to "북마크"`
  - 아이콘: `Icons.Default.Person` → 선택 시 `Icons.Default.Bookmark`, 미선택 시 `Icons.Default.BookmarkBorder`
- `App.kt`:
  - `MYPAGE` 라우트 상수 → `BOOKMARKS`, `composable(BOOKMARKS) { BookmarksScreen() }`
  - `MyPageScreen` import/호출 제거

### 4단계 — 키워드 피드 화면 (홈 카드 탭)

- `App.kt`에 라우트 추가: `keyword/{subscriptionId}?keyword={keyword}`
  - 뒤로가기가 있는 상세 화면이므로 `SEARCH`/`SETTINGS`처럼 바텀바 숨김 처리 (`tabRoute` 조건에 추가)
- `HomeScreen`: 관심사 `ListItem`에 `clickable` 추가 → `onOpenKeywordFeed(id, keyword)` 콜백으로 네비게이션
  - 기존 알림 토글/삭제 IconButton 동작과 클릭 영역 충돌 없게 유지
- `screens/keyword/KeywordFeedScreen.kt`, `KeywordFeedViewModel.kt` 신규
  - `GET /v1/subscriptions/{id}/events`를 cursor 페이징으로 조회
  - 상단: 뒤로가기 + 키워드 제목, 카드 UI는 공용 `FeedItemCard` 재사용 (북마크 토글 포함)
  - 상태: `Loading / Content / Error` + 빈 상태 "아직 수집된 소식이 없어요"

### 5단계 — 로딩 인디케이터 통일

- 공용 컴포넌트 `KeypLoading()` 추가: `Box(fillMaxSize, center) { CircularProgressIndicator() }`
- 적용 대상:
  - **Home**: `state.isLoading`이고 목록이 비어 있을 때 (현재 아무 표시 없음)
  - **Search**: `Submitting` 상태일 때 중앙 서클 로딩 표시 (버튼 비활성화는 유지)
  - **Feed**: 기존 인디케이터를 공용 컴포넌트로 교체
  - **Bookmarks / KeywordFeed**: `Loading` 상태에서 표시

### 6단계 — 검증

- `./gradlew :shared:compileDebugKotlinAndroid`(또는 `:androidApp:assembleDebug`) 컴파일 확인
- 로컬 backend(`http://localhost:3000`) 띄우고 앱 실행:
  1. 피드에서 북마크 토글 → `PATCH` 요청 확인, 앱 재시작 후에도 북마크 유지
  2. 북마크 탭에서 북마크만 표시되는지, 해제 시 목록에서 사라지는지
  3. 홈 카드 탭 → 해당 키워드 이벤트만 표시되는지
  4. 각 화면 로딩 시 서클 로딩바 노출 확인

## 변경 파일 목록

| 파일 | 작업 |
|---|---|
| `data/dto/KeypDtos.kt` | `EventDto.bookmarked`, `UpdateBookmarkRequest` 추가 |
| `data/KeypApi.kt` | `listBookmarks`, `updateBookmark`, `listSubscriptionEvents` 추가 |
| `data/Repositories.kt` | 북마크 서버 연동, `BookmarkRepository` 신설 |
| `di/Koin.kt` | Repository/ViewModel 등록 교체 |
| `ui/components/KeypComponents.kt` | 바텀바 탭 변경, `KeypLoading` 추가 |
| `ui/components/FeedItemCard.kt` | 신규 — 피드 카드 공용화 |
| `App.kt` | 라우트 교체(`mypage`→`bookmarks`), 키워드 피드 라우트 추가 |
| `screens/mypage/*` | 삭제 |
| `screens/bookmarks/*` | 신규 — 북마크 화면 |
| `screens/keyword/*` | 신규 — 키워드 피드 화면 |
| `screens/feed/FeedScreen.kt`, `FeedViewModel.kt` | 카드 추출, 북마크 suspend 호출 |
| `screens/home/HomeScreen.kt` | 카드 클릭 → 키워드 피드 이동, 초기 로딩 인디케이터 |
| `screens/search/SearchScreen.kt` | 제출 중 서클 로딩 표시 |
