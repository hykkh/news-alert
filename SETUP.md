# news-alert 셋업 가이드

## 새 PC에서 완전 셋업 (30분)

### 1. 사전 조건
- Node.js LTS (`node -v` → v20+)
- Python 3.10+
- JDK 17 (`java -version`)
- Git, GitHub CLI (`gh auth login` 완료)
- Android SDK + NDK — `setup-android-env.ps1` 1회 실행

### 2. 클론 + 의존성
```bash
mkdir -p /c/H-Programs && cd /c/H-Programs
git clone https://github.com/hykkh/news-alert.git
cd news-alert
npm install
```

### 3. `.env` 만들기
`.env.example`을 복사해 `.env`로 저장하고 본인 키 입력:
```env
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
EXPO_PUBLIC_NAVER_CLIENT_ID=...
EXPO_PUBLIC_NAVER_CLIENT_SECRET=...
```
**주의: `.env`는 git에 커밋되지 않음.** 새 PC로 옮길 땐 아래 방법 중 하나:

**A. 수동 복사 (가장 안전)**
- 기존 PC: `type C:\H-Programs\news-alert\.env | clip`
- 새 PC: 메모장 열어 붙여넣기 → `C:\H-Programs\news-alert\.env`로 저장

**B. Private Gist**
```bash
gh gist create .env --desc "news-alert env" --secret  # 비공개 gist 생성
# 새 PC에서:
gh gist view <gist-id> --raw > .env
```

**C. OneDrive 경로 (news-push-server.py가 자동 fallback으로 읽음)**
- `C:\Users\<유저>\OneDrive\claude-sync\news-alert\.env`에 두면 자동 로드

### 4. Android 네이티브 코드 확보
`android/` 폴더는 `.gitignore`되어 있습니다. 옵션:
- **기존 PC에서 복사**: `android/` 폴더 통째로 새 PC로 복사 (권장 — 커스텀 Kotlin 모듈 포함)
- **Expo prebuild** (깨끗한 PC에서): `npx expo prebuild -p android` 실행 → 기본 android/ 생성됨. 이후 `android/app/src/main/java/com/kkh/keywordnews/` 하위의 커스텀 Kotlin 파일(BootReceiver, NewsAlarmReceiver, NewsCheckService, NewsCheckWorker, NewsPrefsModule, NewsPrefsPackage)을 수동 오버레이 + `MainApplication.kt`에 NewsPrefsPackage 등록.

### 5. APK 빌드
```powershell
# 터미널 1 (계속 유지)
cd C:\H-Programs\news-alert
node maven-proxy.js

# 터미널 2
cd C:\H-Programs\news-alert\android
.\gradlew assembleRelease --no-daemon
```
결과: `android\app\build\outputs\apk\release\app-release.apk`

### 6. 폰 설치
```powershell
C:\Users\$env:USERNAME\Android\Sdk\platform-tools\adb.exe install -r `
  C:\H-Programs\news-alert\android\app\build\outputs\apk\release\app-release.apk
```

### 7. PC 푸시서버 상시 실행
```powershell
cd C:\H-Programs\news-alert
python news-push-server.py
```
- 포트 `8889` 방화벽 허용 필요 (폰 ↔ PC 같은 Wi-Fi)
- 폰에서 앱 1회 실행하면 토큰이 자동 전송됨 (단, 앱에 토큰 POST 코드가 있어야 함 — 확인 필요)

---

## 개발 워크플로우

### 편집 → 커밋 → 배포
```bash
cd C:\H-Programs\news-alert
# 코드 수정
git add -A
git commit -m "메시지"
git push
```
다른 PC에서: `git pull` 만으로 동기화.

### Metro로 실시간 개발 (Expo Go 제한)
```bash
npx expo start
```
커스텀 네이티브 모듈 때문에 Expo Go로는 전체 기능 테스트 불가 — 실기기 APK 빌드 필요.

### 키 변경
- 앱 내 **설정 → Naver API 키** 화면에서 수동 입력 (AsyncStorage 저장)
- 또는 `.env` 변경 후 APK 재빌드

---

## 알려진 이슈

1. **`syncApiKeys` 네이티브 메서드 미구현**  
   [naverKeyService.ts:40](src/services/naverKeyService.ts)이 호출하지만 [NewsPrefsModule.kt](android/app/src/main/java/com/kkh/keywordnews/NewsPrefsModule.kt)엔 메서드 없음.  
   → `NewsPrefsModule.kt`에 `syncApiKeys(clientId, clientSecret, promise)` 메서드 추가 필요.  
   → `NewsCheckWorker.kt`가 SharedPreferences의 `naver_client_id` / `naver_client_secret`를 읽도록 변경 필요 (현재 하드코딩).

2. **`.env`와 GitHub 분리** — 의도된 설계. `.env`는 개별 관리.

3. **Firebase 실사용 없음** — `src/config/firebase.ts`에 초기화만 있고 호출 코드 없음. 필요 없다면 `firebase` 의존성 제거로 번들 경량화 가능.

4. **`android/` gitignore** — Expo 기본 정책. 프로젝트 특성상 커스텀 네이티브 코드를 커밋하려면 `.gitignore`의 `/android` 줄 제거 고려.
