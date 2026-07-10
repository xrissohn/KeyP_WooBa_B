# UI 개선 작업 계획

2026-07-10 요구사항 기준. 모든 UI 코드는 `shared/src/commonMain/kotlin/com/jetbrains/kmpapp/` 하위에 있음 (Compose Multiplatform 공용 코드이므로 Android/iOS 동시 반영).

---

## 1. 홈 화면 (`screens/home/HomeScreen.kt`)

### 1-1. 상단 플러스 버튼 제거
- 현재: "내 관심사" 헤더 Row 오른쪽에 `IconButton(Icons.Default.Add)` 존재 (`HomeScreen.kt:22`)
- 수정: 해당 `IconButton` 삭제. Row는 유지하되 `horizontalArrangement.SpaceBetween` 불필요해지므로 정리
- 하단 "관심사 추가" `PrimaryButton`은 유지 (관심사 추가 진입점으로 계속 사용)

### 1-2. "실시간 알림" 왼쪽에 초록색 동그라미 표시
- 현재: `supportingContent = { Text(if (item.active) "실시간 알림" else "알림 일시정지") }`
- 수정: `supportingContent`를 `Row(verticalAlignment = CenterVertically)`로 변경
  - active일 때: 지름 **8.dp**의 `Box(Modifier.size(8.dp).clip(CircleShape).background(KeypColors.Success))` + `Spacer(4.dp)` + "실시간 알림" 텍스트
  - 색상은 기존 팔레트의 `KeypColors.Success`(`0xFF12B76A`, `ui/theme/Color.kt:19`) 사용 — 새 색상 추가 불필요
  - 일시정지 상태에는 동그라미 없이 "알림 일시정지" 텍스트만

### 1-3. 알림 일시정지 항목 흐리게 처리
- 현재: 관심사 목록이 `ListItem`으로 렌더링되며 상태와 무관하게 동일한 스타일
- 수정: `item.active == false`인 경우 항목 전체에 `Modifier.alpha(0.45f)` 적용
  - `ListItem(modifier = Modifier.alpha(if (item.active) 1f else 0.45f), ...)`
  - 아이콘·텍스트·삭제 버튼까지 통째로 흐려져 "일시정지됨"이 시각적으로 구분됨
  - import 추가: `androidx.compose.ui.draw.alpha`

### 1-4. 헤더에 설정(톱니바퀴) 아이콘 추가 → 알림 설정 페이지 이동
- `ui/components/KeypComponents.kt`의 `KeypTopBar`에 선택적 파라미터 추가:
  ```kotlin
  @Composable fun KeypTopBar(back: (() -> Unit)? = null, onSettings: (() -> Unit)? = null)
  ```
  - `onSettings != null`이면 Row 오른쪽 끝(`Spacer(Modifier.weight(1f))` 뒤)에 `IconButton { Icon(Icons.Default.Settings, "설정") }` 배치
- `HomeScreen`에 `onOpenSettings: () -> Unit` 파라미터 추가 → `KeypTopBar(onSettings = onOpenSettings)` 전달
- 다른 화면(피드/마이페이지/검색)은 기존 시그니처 그대로 동작 (기본값 null)

### 1-5. 알림 설정 페이지 신규 생성
- 신규 파일: `screens/settings/NotificationSettingsScreen.kt`, `screens/settings/SettingsViewModel.kt`
- 화면 구성:
  - `KeypTopBar(back = onBack)` (뒤로가기 포함)
  - "알림 설정" 헤드라인 (`headlineLarge`)
  - `Card { ListItem(headlineContent = { Text("푸시 알림 설정") }, trailingContent = { Switch(state.pushEnabled, vm::togglePush) }) }` — 문구 왼쪽, 토글 오른쪽 끝
- `SettingsViewModel`: 기존 `MyPageViewModel.togglePush`(`screens/mypage/MyPageViewModel.kt:29-35`)와 동일한 로직 — `DeviceRepository.setEnabled` + `PushTokenProvider` 사용
- `di/Koin.kt`에 `viewModel { SettingsViewModel(get(), get()) }` 등록
- `App.kt`에 `SETTINGS = "settings"` 라우트 추가:
  - `composable(SETTINGS) { NotificationSettingsScreen(onBack = { navController.popBackStack() }) }`
  - SEARCH와 마찬가지로 바텀 네비게이션 숨김 처리 (`tabRoute` 조건에 SETTINGS 추가)
- 참고: 마이페이지에도 동일한 푸시 토글이 있음 — 토글 상태가 서버 저장이 아니라 각 ViewModel 로컬 state이므로 두 화면 간 상태 불일치 가능. 이번 작업에서는 설정 페이지 신설까지만 하고, 상태 공유(예: `DeviceRepository`에 `pushEnabled` StateFlow 추가)는 후속 개선으로 메모

### 1-6. KeyP 로고 사이즈 확대 (모든 화면 공통)
- 현재: `KeypTopBar`의 `Text("KeyP", fontWeight = Bold, ...)` — 스타일 미지정이라 기본 bodyLarge(15sp)
- 수정: `style = MaterialTheme.typography.titleMedium`(18sp, `ui/theme/Theme.kt:14`) 적용해 body2 상당으로 확대
  - `KeypTopBar` 한 곳만 고치면 홈/피드/마이페이지/검색/설정 전 화면에 반영됨

---

## 2. 속보 피드 화면 (`screens/feed/FeedScreen.kt`)

### 2-1. 화면 타이틀 문구 변경
- `Text("속보 피드", ...)` (`FeedScreen.kt:31`) → `Text("관심사 피드", ...)`

### 2-2. 바텀 네비게이션 라벨 변경
- `ui/components/KeypComponents.kt:34`의 `"feed" to "속보 피드"` → `"feed" to "피드"`

### 2-3. 날짜·시간 분 단위까지만 표시
- 데이터: `FeedItem.createdAt`은 ISO-8601 문자열 (예: `2026-07-10T14:23:45Z`)
- 현재 카드에는 시간이 렌더링되지 않으므로, 카드 상단 provider 라벨 오른쪽(또는 하단)에 시간 표시를 추가하면서 분까지만 포맷:
  ```kotlin
  fun formatToMinute(iso: String) = iso.take(16).replace('T', ' ')  // "2026-07-10 14:23"
  ```
  - `Text(formatToMinute(item.createdAt), style = labelMedium, color = KeypColors.InkSoft)`
  - 초/타임존 꼬리표는 잘려나감. 별도 datetime 라이브러리 불필요 (단순 문자열 절단)
- 만약 다른 위치에서 이미 시간이 노출되고 있다면 동일 포맷 함수를 재사용해 통일

---

## 3. 검색 화면 (`screens/search/SearchScreen.kt`, `App.kt`)

### 3-1. 백핸들러 후 바텀 네비게이션 사라지는 버그 수정
- 원인: `App.kt:35`에서 현재 라우트를 `var currentRoute by mutableStateOf(HOME)`로 별도 관리하는데, 시스템 뒤로가기(백핸들러)는 `navController`만 pop하고 `currentRoute`는 `"search"`로 남음 → `tabRoute = currentRoute != SEARCH`가 계속 false라서 홈으로 돌아와도 바텀바가 숨겨진 채 유지됨
- 수정: 수동 state 제거하고 NavController에서 라우트를 직접 파생:
  ```kotlin
  val backStackEntry by navController.currentBackStackEntryAsState()
  val currentRoute = backStackEntry?.destination?.route ?: HOME
  ```
  - `KeypBottomBar` 선택 상태, `tabRoute` 판단 모두 이 값으로 대체
  - 각 `composable` 람다 안의 `currentRoute = ...` 대입 코드 전부 삭제 (navigate/popBackStack만 남김)
  - 뒤로가기·탭 이동·검색 진입 어떤 경로로도 상태 불일치가 원천적으로 사라짐

### 3-2. 글자 제한 200자
- `screens/search/SearchViewModel.kt:27`: `text.take(2000)` → `text.take(200)`
- `screens/search/SearchScreen.kt:43`: supportingText `"${text.length}/2000"` → `"${text.length}/200"`

---

## 작업 순서 및 검증

| 순서 | 작업 | 파일 |
|---|---|---|
| 1 | 라우트 상태를 NavController 파생으로 교체 (3-1) | `App.kt` |
| 2 | KeypTopBar 로고 확대 + 설정 아이콘 파라미터 (1-4, 1-6) | `KeypComponents.kt` |
| 3 | 바텀 네비 라벨 "피드" (2-2) | `KeypComponents.kt` |
| 4 | 알림 설정 화면 + ViewModel + Koin + 라우트 (1-5) | 신규 2개 파일, `Koin.kt`, `App.kt` |
| 5 | 홈 화면: 플러스 제거·초록 점·흐림 처리·설정 연결 (1-1~1-4) | `HomeScreen.kt` |
| 6 | 피드: 타이틀 변경 + 시간 분 단위 표시 (2-1, 2-3) | `FeedScreen.kt` |
| 7 | 검색: 200자 제한 (3-2) | `SearchViewModel.kt`, `SearchScreen.kt` |

**검증 체크리스트**
- [ ] `./gradlew :androidApp:assembleDebug` 빌드 통과
- [ ] 홈: 플러스 버튼 없음, active 항목에 초록 점, 일시정지 항목 흐림
- [ ] 헤더 톱니바퀴 → 알림 설정 페이지 진입, 토글 동작, 뒤로가기 정상
- [ ] 전 화면에서 KeyP 로고 커진 것 확인
- [ ] 바텀 네비 "피드" 라벨, 피드 타이틀 "관심사 피드", 시간이 분까지만 표시
- [ ] 검색 화면에서 시스템 뒤로가기 → 홈 복귀 시 바텀 네비 정상 표시
- [ ] 검색 입력 200자에서 잘리고 카운터 "n/200" 표시
