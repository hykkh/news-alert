# news-alert 인계 노트 (2026-04-26)

## 현재 상태
- **마지막 APK**: `dist-apk/v6-20260426-app-release.apk` (23.1MB)
- **텔레그램으로도 v6 전송됨** (메시지 ID 243). 폰에서 받아 설치 가능.
- **미해결**: 폰에서 v4/v5/v6 모두 시작 즉시 "중단됨" 크래시. v3까지는 정상.
  - v4 원인 추정: `react-native-svg` 네이티브 충돌
  - v5 원인 추정: `qrcode` npm (Buffer/stream 의존)
  - v6: `qrcode-generator` + `<View>` 점 격자로 그림. 미테스트.
- **테스트 보류**: 이 PC에서 ADB에 폰이 안 잡혀 logcat 못 받음.

## 새 PC에서 이어가기

### 1. OneDrive 동기화 대기
새 PC에 `C:\Users\admin\OneDrive\H-Programs` 동기화 끝나면 다음 정보 모두 옴:
- `src/` 전체 (TypeScript)
- `android/` 전체 (Kotlin) — git 미트래킹이지만 OneDrive로 옴
- `dist-apk/v6-20260426-app-release.apk` (직접 폰에 옮겨 설치 가능)
- `HANDOFF.md` (이 파일)

### 2. junction 재생성
```powershell
ni 'C:\H-Programs' -ItemType Junction -Target 'C:\Users\admin\OneDrive\H-Programs'
```

### 3. node_modules 복원 (OneDrive 동기화 안 됨)
```powershell
cd C:\H-Programs\news-alert
npm install
```

### 4. ADB로 폰 연결 후 logcat
```powershell
$env:ANDROID_HOME='C:\Users\admin\Android\Sdk'
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
# 폰 USB 연결 + 개발자모드 + USB 디버깅 ON

# v6 설치
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r 'C:\H-Programs\news-alert\dist-apk\v6-20260426-app-release.apk'

# 실행 + 실시간 로그
& "$env:ANDROID_HOME\platform-tools\adb.exe" logcat -c
& "$env:ANDROID_HOME\platform-tools\adb.exe" shell am start -n com.kkh.keywordnews/.MainActivity
& "$env:ANDROID_HOME\platform-tools\adb.exe" logcat *:E AndroidRuntime:E ReactNative:V ReactNativeJS:V
```

### 5. 빌드 캐시는 새로 만들기 (OneDrive junction 빌드 실패 회피)
```powershell
robocopy C:\H-Programs\news-alert C:\temp\news-alert-build /E /XD node_modules android\app\build android\build .git __pycache__ /XF *.log
robocopy C:\H-Programs\news-alert\node_modules C:\temp\news-alert-build\node_modules /E /MIR
cd C:\temp\news-alert-build\android
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot'
$env:ANDROID_HOME='C:\Users\admin\Android\Sdk'
.\gradlew.bat assembleRelease --no-daemon
```
→ 새 APK: `C:\temp\news-alert-build\android\app\build\outputs\apk\release\app-release.apk`

## 이번 세션에서 변경된 코드

### git 트래킹 (`git diff`로 확인 가능)
| 파일 | 변경 |
|------|------|
| `src/screens/SettingsScreen.tsx` | 권한 섹션 UI, QR 격자 렌더링, 공유코드 라벨 수정 |
| `src/screens/KeywordScreen.tsx` | shared 사용자 키워드 3개 제한 UI |
| `src/services/keywordService.ts` | `MAX_KEYWORDS_FOR_SHARED`, `SharedKeywordLimitError` |
| `package.json` | `qrcode-generator` 추가 |
| `news-push-server.py` | (이전 세션 미커밋) |

### git 미트래킹 (OneDrive로만 동기화)
| 파일 | 변경 |
|------|------|
| `android/app/src/main/java/com/kkh/keywordnews/NewsPrefsModule.kt` | 권한 메서드 4개 추가: `isIgnoringBatteryOptimizations`, `canScheduleExactAlarms`, `openExactAlarmSettings`, `openAppSettings` |
| `android/app/src/main/java/com/kkh/keywordnews/NewsCheckWorker.kt` | 키워드 0개 시 알람 스킵 (전엔 강제 "삼성/AI" 검색) |

⚠️ `expo prebuild`나 `expo run:android` 실행하면 android/ 가 리셋되어 위 변경사항이 사라집니다. 빌드는 위 절차대로 직접 gradle만 호출.

## 크래시 진단 다음 시도 (logcat 받은 후)

증상 패턴별 의심:
- `java.lang.NoSuchMethodError`/`UnsatisfiedLinkError`: 네이티브 모듈 누락 → 새 추가한 NewsPrefsModule 메서드 시그니처 확인
- `JavaScript heap out of memory` / Hermes throw at module eval: qrcode-generator import 시점 문제 → SettingsScreen에서 dynamic require로 lazy 로딩
- `expo-modules-core` 관련: prebuild 미동기화 가능성
- 무관한 부분이 원인이면 v3 베이스로 git checkout 후 권한 메서드 한 개씩 다시 추가하며 이분탐색

## 정리할 것 (선택)
- `C:\temp\news-alert-build` (1.6GB 빌드 캐시) — 다른 PC로 가면 어차피 새로 만들어야 하니 이 PC에서 삭제 OK
- node_modules는 OneDrive에 안 들어가니 신경 X

## 의도적으로 git commit 안 함
- 사용자 명시 요청 없이 commit 자동 수행 안 함 정책. 다른 PC에서 git status 확인 후 본인이 결정.
- `git diff` / `git diff --stat`으로 검토 후 `git add -p` 권장.
