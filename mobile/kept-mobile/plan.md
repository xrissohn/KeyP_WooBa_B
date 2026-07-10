# KeyP 모바일 앱 구현 설계 (MVVM)

`KeyP App - Standalone.html` 목업을 기준으로 Kotlin Multiplatform(Compose Multiplatform) 앱을 MVVM 구조로 구현하기 위한 설계 문서.

---

## 1. 목업 분석

HTML 목업(A-Mart 디자인 시스템 기반)에는 393×852(iPhone) 프레임의 3개 화면이 있다.

### 화면 1 — 속보 피드 (Feed)
- 상단 헤더: `KeyP` 로고 (primary 컬러, 20px bold)
- 타이틀: "속보 피드" (30px bold)
- **피드 카드** 3가지 변형:
  - 텍스트 카드: 관심도 게이지(3-bar) + 매칭률(92%) + 출처(연합뉴스) + 경과시간(5분 전) + 제목 + 요약 + 구분선 + "원문 보기" 링크 + 북마크/공유 아이콘
  - 이미지 카드: 상단 히어로 이미지 + "AI 추천 피드" 뱃지 + 매칭률/출처/시간 + 제목 + 요약 + "영상 요약 보기" CTA 버튼
  - 썸네일 카드: 좌측 텍스트(매칭률 + 출처 + 제목 + 1줄 요약) + 우측 88×88 썸네일
- **하단 미니 카드** 2개: "나의 관심도 변화"(진행바), "인기 급상승 키워드"(primary 배경)

### 화면 2 — 내 관심사 (Interests)
- 타이틀 "내 관심사" + 우측 `+` 원형 버튼
- **관심사 카드 리스트**: 아이콘(primary-soft 배경 12px 라운드) + 제목 + "실시간 알림" 서브텍스트 + 우측 벨 아이콘
- 하단 "관심사 추가" full-width CTA 버튼

### 화면 3 — AI 검색 (관심사 추가 서브 화면)
- 타이틀 "무엇이든 편하게 검색하세요" + 안내 문구
- "주제" 라벨 + 멀티라인 입력 박스(placeholder, 글자수 카운터 `6/2000`)
- AI 분석 실행 CTA 버튼
- **탭이 아닌 서브 화면**: Home(내 관심사)의 `+` 버튼 / "관심사 추가" CTA로 push 진입, 상단 뒤로가기로 복귀

### 화면 4 — 마이페이지 (목업 없음 → 자체 구성, §5.4 참고)

### 하단 네비게이션 (3탭)
| 탭 | 화면 | 비고 |
|----|------|------|
| 속보 피드 (Feed) | 화면 1 | 신규 이벤트 피드 |
| **Home** | 화면 2 (내 관심사) | **시작 탭**, 가운데 배치 |
| 마이페이지 (My Page) | 화면 4 | 자체 구성 |

AI 검색 화면은 하단 탭이 아니라 Home 위에 쌓이는 서브 화면(back stack push). 서브 화면에서는 하단 바를 숨긴다.

---

## 2. 백엔드 연동 (Interest Radar API)

`../../docs/openapi.yaml` 기준. Base URL: `http://localhost:3000`, 인증: `x-user-id` 헤더(개발용).

| 화면 | API | 용도 |
|------|-----|------|
| 속보 피드 | `GET /v1/events?cursor=` | 전체 신규 이벤트 polling → 피드 카드 |
| Home(내 관심사) | `GET /v1/subscriptions` | 구독 목록 |
| Home(내 관심사) | `PATCH /v1/subscriptions/{id}/status` | 알림 일시정지/재개 (벨 토글) |
| Home(내 관심사) | `DELETE /v1/subscriptions/{id}` | 구독 삭제 (스와이프/롱프레스) |
| AI 검색(서브) | `POST /v1/subscriptions` | 키워드 → AI 검색계획 생성 = 관심사 등록 |
| 마이페이지 | `POST /v1/devices` / `DELETE /v1/devices` | 푸시 알림 on/off (FCM 토큰 등록·해제) |
| 마이페이지 | `GET /v1/subscriptions` | 구독 수 요약 (Repository 공유) |

### 핵심 스키마 매핑
- `Subscription { id, keyword, plan, active, createdAt, nextRunAt }` → 관심사 카드
- `Event { cursor, subscriptionId, item, createdAt }` → 피드 카드
- `EventItem { provider, externalId, url, title, summary?, publishedAt?, firstSeenAt }` → 카드 내용
  - `provider`(예: `naver:news`) → 출처 라벨/아이콘
  - `url` → "원문 보기"
  - `createdAt` → "5분 전" 상대시간
  - 매칭률(92%)·이미지 → **API에 없음**. v1에서는 표시 생략 또는 provider 기반 더미 처리, 백엔드 확장 시 추가

### 커서 규칙
`cursor`는 서버 내부 단조 증가 이벤트 ID. 응답의 `nextCursor`를 로컬에 저장했다가 다음 요청에 그대로 사용 (Settings/DataStore에 영속화).

---

## 3. 아키텍처 — MVVM

기존 KMP 템플릿(Compose Multiplatform + Ktor + kotlinx.serialization + Koin + Coil)의 관용구를 그대로 따르되, 네비게이션은 템플릿의 Compose Navigation(NavHost)을 **Navigation 3**로 교체한다(§5.5). 모든 로직은 `shared` 모듈 `commonMain`에 두고, `androidApp`/`iosApp`은 진입점만 유지.

```
┌─────────────────────────────────────────────┐
│  View (Compose)          screens/*/…Screen  │
│    └─ collectAsStateWithLifecycle           │
├─────────────────────────────────────────────┤
│  ViewModel               screens/*/…ViewModel│
│    └─ StateFlow<UiState> + 이벤트 함수       │
├─────────────────────────────────────────────┤
│  Repository              data/…Repository   │
│    └─ Flow 노출, API·로컬 저장 조율          │
├─────────────────────────────────────────────┤
│  DataSource   data/KeypApi (Ktor) · Storage │
└─────────────────────────────────────────────┘
```

원칙:
- **단방향 데이터 흐름(UDF)**: View → ViewModel 함수 호출, ViewModel → View는 `StateFlow<UiState>`만
- UiState는 화면당 하나의 sealed interface 또는 data class (`Loading / Content / Error`)
- Repository는 suspend 함수 + `Flow` 노출. ViewModel에서 `stateIn(viewModelScope, WhileSubscribed(5000), …)` (기존 `ListViewModel` 패턴)
- DTO(직렬화 모델)와 UI 모델 분리. 매핑은 Repository 계층에서

### 패키지 구조 (`shared/src/commonMain/kotlin/com/jetbrains/kmpapp/`)

```
├── App.kt                          # NavDisplay(Nav3) + Scaffold(BottomBar) — 수정
├── navigation/
│   └── NavKeys.kt                  # NavKey 정의 (FeedKey, HomeKey, MyPageKey, SearchKey)
├── di/Koin.kt                      # 모듈 등록 — 수정
├── ui/theme/
│   ├── Color.kt                    # 디자인 토큰 → Compose Color
│   ├── Type.kt                     # 타이포 스케일 → Typography
│   └── Theme.kt                    # KeypTheme (MaterialTheme 래핑)
├── ui/components/
│   ├── KeypTopBar.kt               # "KeyP" 로고 헤더 (서브 화면은 뒤로가기 variant)
│   ├── KeypBottomBar.kt            # 3탭 하단 네비게이션 (Feed / Home / My Page)
│   ├── MatchGauge.kt               # 3-bar 관심도 게이지 + %
│   ├── SourceBadge.kt              # 출처(provider) 라벨
│   ├── SettingRow.kt               # 마이페이지 설정 행 (아이콘+라벨+스위치/화살표)
│   └── PrimaryButton.kt            # full-width CTA 버튼
├── data/
│   ├── KeypApi.kt                  # interface + KtorKeypApi (Ktor 구현)
│   ├── dto/                        # Subscription, Event, EventItem 등 @Serializable DTO
│   ├── SubscriptionRepository.kt
│   ├── FeedRepository.kt           # 이벤트 polling + cursor 관리
│   ├── DeviceRepository.kt         # FCM 토큰 등록/해제 (푸시 on/off)
│   └── CursorStorage.kt            # nextCursor 영속화 (v1: in-memory → 이후 DataStore)
├── model/
│   ├── FeedItem.kt                 # UI 모델 (제목, 요약, 출처, 상대시간, url…)
│   └── Interest.kt                 # UI 모델 (id, keyword, active, icon…)
└── screens/
    ├── feed/    FeedScreen.kt · FeedViewModel.kt · FeedUiState.kt
    ├── home/    HomeScreen.kt · HomeViewModel.kt · HomeUiState.kt      # 내 관심사
    ├── search/  SearchScreen.kt · SearchViewModel.kt · SearchUiState.kt # 서브 화면
    └── mypage/  MyPageScreen.kt · MyPageViewModel.kt · MyPageUiState.kt
```

기존 `Museum*` 예제 파일(`data/Museum*.kt`, `screens/list`, `screens/detail`)은 골격 완성 후 삭제.

---

## 4. 디자인 시스템 포팅

HTML의 CSS 토큰을 Compose로 1:1 이관.

### Color.kt
```kotlin
object KeypColors {
    val Primary        = Color(0xFF1565FF)
    val PrimaryHover   = Color(0xFF0D52D6)
    val PrimarySoft    = Color(0xFFEAF2FF)
    val PrimaryBorder  = Color(0xFFB8D0FF)
    val Canvas         = Color(0xFFFFFFFF)
    val CanvasSoft     = Color(0xFFF7F9FC)
    val Surface        = Color(0xFFFAFBFD)
    val Border         = Color(0xFFE7ECF3)
    val BorderStrong   = Color(0xFFD7DEE9)
    val Footer         = Color(0xFF071B46)   // deep navy (AI 추천 뱃지 배경)
    val Ink            = Color(0xFF101828)
    val InkSecondary   = Color(0xFF475467)
    val InkSoft        = Color(0xFF667085)
    val InkDisabled    = Color(0xFF98A2B3)
    val Success        = Color(0xFF12B76A)
    val SuccessSoft    = Color(0xFFE6F8EE)
    val Warning        = Color(0xFFF79009)
    val Error          = Color(0xFFF04438)
}
```

### Type.kt — 목업 실측 기준 모바일 스케일
| 용도 | 크기/두께 | 사용처 |
|------|-----------|--------|
| ScreenTitle | 30sp / Bold | "속보 피드", "내 관심사" |
| SearchTitle | 26sp / Bold | "무엇이든 편하게 검색하세요" |
| Logo | 20sp / Bold | 헤더 "KeyP" |
| CardTitle | 18sp / SemiBold | 피드 카드 제목 |
| Body | 15sp / Regular | 요약, CTA 텍스트 |
| Caption | 13-14sp / Regular | 출처, 서브텍스트 |
| Micro | 11-12sp / Medium | 탭 라벨, 시간, 카운터 |

- 폰트: 시스템 기본(SF/Roboto)으로 시작. Pretendard는 `composeResources`에 woff→ttf 변환 후 선택 적용 (후순위)
- Radius: card 16dp / button·input 12dp / pill 9999dp, 아이콘: `compose-icons` Lucide 또는 Material Icons 대체 매핑

---

## 5. 화면별 설계

### 5.1 속보 피드 (FeedScreen) — Feed 탭
```kotlin
sealed interface FeedUiState {
    data object Loading : FeedUiState
    data class Content(val items: List<FeedItem>, val isRefreshing: Boolean = false) : FeedUiState
    data class Error(val message: String) : FeedUiState
}
class FeedViewModel(private val feedRepository: FeedRepository) : ViewModel() {
    val uiState: StateFlow<FeedUiState>   // repository flow → stateIn
    fun refresh()                          // pull-to-refresh → poll /v1/events
    fun onBookmark(item: FeedItem)         // v1: 로컬 토글
    fun onOpenOriginal(item: FeedItem)     // url 외부 브라우저 열기 (expect/actual)
}
```
- `LazyColumn` + 피드 카드 Composable. v1은 텍스트 카드 1종으로 시작, 이미지/썸네일 변형은 `EventItem`에 이미지 필드가 생기면 추가
- 상대시간("5분 전")은 `kotlinx-datetime`으로 계산
- 빈 피드일 때: "새 소식이 없어요" 빈 상태 뷰 (구독이 없으면 관심사 등록 유도)
- 하단 미니 카드 2개는 정적 통계가 API에 없으므로 **v2로 연기**

### 5.2 Home — 내 관심사 (HomeScreen) — 시작 탭
```kotlin
data class HomeUiState(
    val interests: List<Interest> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)
class HomeViewModel(private val subscriptionRepository: SubscriptionRepository) : ViewModel() {
    val uiState: StateFlow<HomeUiState>
    fun toggleNotification(id: String)   // PATCH status active↔paused → 벨 아이콘 on/off
    fun delete(id: String)               // DELETE (확인 다이얼로그 후)
    fun refresh()
}
```
- `+` 버튼 / "관심사 추가" CTA → **SearchKey를 back stack에 push** (서브 화면 진입)
- 아이콘: 키워드 해시 기반으로 아이콘 팔레트(compass, heart, trending-up, coffee, shield…)에서 결정적 선택
- `active=false`(일시정지)인 구독은 벨 아이콘 회색 처리

### 5.3 AI 검색 (SearchScreen) — Home의 서브 화면
```kotlin
sealed interface SearchUiState {
    data class Editing(val text: String = "", val maxLength: Int = 2000) : SearchUiState
    data object Submitting : SearchUiState
    data class Success(val subscription: Interest) : SearchUiState
    data class Error(val text: String, val message: String) : SearchUiState
}
class SearchViewModel(private val subscriptionRepository: SubscriptionRepository) : ViewModel() {
    fun onTextChange(text: String)   // 2000자 제한 + 카운터
    fun submit()                     // POST /v1/subscriptions
}
```
- 상단바: 뒤로가기 아이콘 variant(`KeypTopBar`), 하단 탭 바 숨김
- 성공 시: back stack pop → Home 복귀 + 스낵바("관심사가 등록되었어요"), Home 목록 자동 갱신
- 실패 시(400 검증 오류 등): 인라인 에러 메시지
- 시스템/제스처 back → pop (입력 중이면 그대로 폐기, v1은 확인 다이얼로그 없음)

### 5.4 마이페이지 (MyPageScreen) — 목업 없음, 자체 구성
디자인 시스템 토큰을 그대로 사용해 다른 화면과 톤을 맞춘 설정형 화면으로 구성한다.

레이아웃(위→아래):
1. **프로필 카드** — 이니셜 아바타(primary-soft 원형) + 사용자 이름/개발용 ID + "구독 중인 관심사 N개" 요약
2. **알림 섹션** — `SettingRow` 리스트 카드
   - 푸시 알림 (Switch) → on: `POST /v1/devices`(FCM 토큰 등록) / off: `DELETE /v1/devices`
3. **콘텐츠 섹션**
   - 북마크한 피드 (v1: 로컬 북마크 목록 화면 or "준비 중" 배지)
   - 관심사 관리 → Home 탭으로 전환
4. **앱 정보 섹션** — 버전, 오픈소스 라이선스, 문의하기(mailto)
5. (v2 자리) 로그인/계정 연동 — 현재 `x-user-id` 고정이므로 UI만 자리 확보

```kotlin
data class MyPageUiState(
    val userName: String,                 // v1: 고정 개발용 프로필
    val subscriptionCount: Int = 0,
    val pushEnabled: Boolean = false,
    val appVersion: String = "",
)
class MyPageViewModel(
    private val subscriptionRepository: SubscriptionRepository,
    private val deviceRepository: DeviceRepository,
) : ViewModel() {
    val uiState: StateFlow<MyPageUiState>
    fun togglePush(enabled: Boolean)      // 디바이스 등록/해제, 실패 시 스위치 롤백
}
```
- FCM 토큰 획득은 platform-specific → `expect fun currentPushToken(): String?` (iOS/Android actual). v1에서 FCM 미연동 상태면 스위치는 로컬 상태만 저장하고 TODO로 표시

### 5.5 네비게이션 — Navigation 3 (App.kt)
Compose Navigation(NavHost) 대신 **Navigation 3**(`NavDisplay` + back stack을 상태로 직접 소유)를 사용한다.
KMP에서는 JetBrains 포팅(`org.jetbrains.androidx.navigation3:navigation3-*`)을 사용.

```kotlin
// navigation/NavKeys.kt
@Serializable data object FeedKey   : NavKey
@Serializable data object HomeKey   : NavKey   // 시작 키
@Serializable data object MyPageKey : NavKey
@Serializable data object SearchKey : NavKey   // Home 위에 push되는 서브 화면
```

```kotlin
// App.kt (개요)
val backStack = rememberNavBackStack(HomeKey)
val current = backStack.lastOrNull()
val isTabScreen = current is FeedKey || current is HomeKey || current is MyPageKey

Scaffold(
    bottomBar = { if (isTabScreen) KeypBottomBar(current, onTabSelect = { key ->
        // 탭 전환: back stack을 [탭 키] 하나로 교체 (탭 간 back 이력 없음, v1 정책)
        backStack.apply { clear(); add(key) }
    }) }
) {
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<FeedKey>   { FeedScreen(...) }
            entry<HomeKey>   { HomeScreen(onAddInterest = { backStack.add(SearchKey) }) }
            entry<MyPageKey> { MyPageScreen(onManageInterests = { backStack.apply { clear(); add(HomeKey) } }) }
            entry<SearchKey> { SearchScreen(onDone = { backStack.removeLastOrNull() }) }
        }
    )
}
```

- back stack은 `rememberNavBackStack`으로 Composable이 직접 소유 — Nav3의 "state as source of truth" 모델
- **탭 전환 정책**: back stack을 해당 탭 키 하나로 교체. 탭 위에 쌓인 서브 화면(Search)만 back으로 pop
- 화면 전환 애니메이션: `NavDisplay`의 transition 기본값 사용, 서브 화면은 slide-in 지정 가능
- ViewModel 수명: `rememberViewModelStoreNavEntryDecorator` 등 Nav3 entry decorator로 entry별 ViewModel 스코프 유지 + Koin `koinViewModel()` 결합

---

## 6. 네트워크 계층

```kotlin
interface KeypApi {
    suspend fun listSubscriptions(): List<SubscriptionDto>
    suspend fun createSubscription(keyword: String): SubscriptionDto
    suspend fun updateSubscriptionStatus(id: String, active: Boolean): SubscriptionDto
    suspend fun deleteSubscription(id: String)
    suspend fun listEvents(cursor: Long?): EventsPageDto   // { events, nextCursor }
    suspend fun registerDevice(token: String, platform: String)
    suspend fun deleteDevice(token: String)
}
```
- Ktor `HttpClient` + `ContentNegotiation(json)` (기존 것 재사용, `defaultRequest`로 baseUrl·`x-user-id` 헤더 주입)
- baseUrl: v1은 상수 (`http://10.0.2.2:3000` Android 에뮬레이터 / `http://localhost:3000` iOS 시뮬레이터 — expect/actual로 분기)
- userId: v1은 고정 개발용 ID 상수. 이후 인증 도입 시 교체 지점을 `KeypApiConfig` 하나로 국한
- 에러 처리: 4xx/5xx → 도메인 예외로 변환, Repository에서 `Result` 또는 UiState.Error로 전파

---

## 7. 구현 단계 (Phase)

### Phase 1 — 골격
1. Navigation 3 의존성 추가(`libs.versions.toml`) 및 기존 Compose Navigation 대체 확인
2. `ui/theme` 디자인 토큰(Color/Type/Theme) 작성
3. `NavKeys` + `NavDisplay` 기반 App.kt + `KeypBottomBar` + 4개 빈 화면 (탭 3 + Search 서브)
4. Koin 모듈 정리 (Museum 예제와 병행 등록 후 마지막에 제거)

### Phase 2 — 데이터 계층
5. DTO(@Serializable) + `KtorKeypApi` 구현
6. `SubscriptionRepository`, `FeedRepository`(+cursor 관리), `DeviceRepository`
7. Ktor MockEngine 기반 API 단위 테스트 (`commonTest`)

### Phase 3 — 화면 구현 (화면당 View + ViewModel 세트)
8. **Home(내 관심사)** (가장 단순, 목록 조회) → 토글/삭제
9. **AI 검색 서브 화면** (push 진입 → 등록 → pop 복귀 플로우)
10. **속보 피드** (이벤트 polling + 카드 UI + pull-to-refresh)
11. **마이페이지** (프로필 카드 + 설정 리스트, 푸시 토글은 로컬 상태부터)

### Phase 4 — 마무리
12. 빈 상태/에러 상태/로딩 상태 다듬기, 상대시간 표시
13. Museum 예제 코드 삭제, 패키지명 정리
14. ViewModel 단위 테스트 (Turbine 등으로 StateFlow 검증)
15. (선택) FCM 디바이스 등록 실연동, Pretendard 폰트, 이미지 카드 변형

각 Phase 종료 시 `./gradlew :androidApp:assembleDebug` + 에뮬레이터 실행으로 검증.

---

## 8. 범위에서 제외 (v1)
- **매칭률(92%) 게이지·피드 이미지** — API 미지원. UI 컴포넌트(`MatchGauge`)만 만들어두고 데이터 생기면 연결
- **북마크 서버 동기화 / 공유하기** — v1은 로컬 토글·OS 공유 시트 정도로 처리하거나 아이콘만 배치
- **"나의 관심도 변화"·"인기 급상승 키워드" 미니 카드** — 통계 API 부재
- **인증 / 로그인** — `x-user-id` 고정 상수로 개발, 마이페이지에 UI 자리만 확보하고 교체 지점 격리
- **FCM 실연동** — 마이페이지 푸시 스위치는 v1에서 로컬 상태, 실제 토큰 등록은 Phase 4 선택 항목

## 9. 리스크 / 결정 필요 사항
- **Navigation 3 KMP 성숙도**: JetBrains의 `navigation3` 멀티플랫폼 포팅은 실험(experimental) 단계 — Phase 1 첫 작업으로 iOS 타깃 포함 빌드를 검증하고, 문제가 크면 back stack 자체를 `SnapshotStateList<NavKey>`로 직접 관리하는 얇은 자체 NavDisplay로 대체(같은 Nav3 모델이므로 이후 교체 용이)
- **cursor 영속화**: v1은 메모리 보관(앱 재시작 시 전체 재조회 → baseline 특성상 중복 폭탄 없음). 필요 시 multiplatform-settings 도입
- **아이콘 라이브러리**: Lucide 호환 KMP 라이브러리 채택 vs Material Icons 매핑 — Phase 1에서 결정
- **iOS 빌드**: 현재 개발 머신에서 Android 우선 검증, iOS는 Phase 4에서 시뮬레이터 확인
