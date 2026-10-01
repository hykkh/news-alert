# 키워드 뉴스 (com.kkh.keywordnews)

네이버 뉴스 API로 관심 키워드 검색 → 새 뉴스 발견 시 모바일 알림. React Native / Expo, Android.

## 구성
- **모바일 앱** — React Native / Expo (`App.tsx`, `src/`, `android/`). 화면: 뉴스 / 키워드 / 설정 3탭
- **PC 서버(선택)** — `news-push-server.py` (키워드 폴링, 있으면 연동)
- 앱 화면 뉴스 = JS `src/services/newsService.ts`(searchNews). 백그라운드 알림 = 네이티브 `NewsCheckWorker.kt`(AlarmManager)

## 빌드 (로컬, 중요)
- **EAS 아님. 로컬 gradlew 로 빌드**: `cmd /c "cd /d <android> && call ""<절대경로>\gradlew.bat"" assembleRelease"` (gradlew는 cmd에서 절대경로 호출 필수)
- 산출물 `android/app/build/outputs/apk/release/app-release.apk`
- **서명 = android/app/debug.keystore (release도 이걸로)**. 서명 지문 `fac61745...` 고정 → 이 keystore 유지해야 사용자 업데이트 시 데이터(토큰) 보존됨. 절대 바꾸지 말 것
- JS 소스/버전 변경 시 clean 빌드 권장 (Metro 번들 재생성)
- 버전 3곳 통일: `package.json`/`app.json` version + `android/app/build.gradle` versionCode·versionName

## 네이버 API 키 = 공유코드 방식 (개인키 빌드 미포함)
- **빌드에 개인 키를 넣지 않는다** (넣으면 배포 APK 전부가 소유자 키 사용→노출+한도 공유). `.env`는 프로젝트 루트에 두지 말 것, `android/local.properties`의 NAVER_* 도 비움
- 사용자는 설정에서 **직접 입력**(→"직접등록") 하거나 **공유코드**(→"공유받음")로 키 등록. `naverKeyService.ts`가 SecureStore에 저장
- 마스터(직접등록)에서 "공유 코드 생성" → 지인이 "공유 코드 입력". 잘못된 키가 저장돼 있으면 재입력으로 덮어쓰면 됨(데이터 삭제 불필요)

## 앱 내 업데이트
- `updateChecker.ts`: **고정 태그 v0.4.9 APK** + 공개 raw 버전파일 `docs/version-news-alert.txt` 로 비교 (releases/latest 금지 — 여러 앱 섞여 오작동)
- 배포: 공개 `hykkh/h-programs` v0.4.9 릴리스에 `news-alert.apk` clobber + `docs/version-news-alert.txt` 갱신 + 카탈로그 index.html tag-version 갱신

## 알려진 이슈 이력
- 정확 알람(setExactAndAllowWhileIdle) 안드12+ 클린설치 크래시 → canScheduleExactAlarms 폴백 (해결)
- 뉴스 화면 미갱신 → HomeScreen useFocusEffect (해결)
- 잘못된 API 키 저장 시 검색 실패("검색 결과가 없습니다") → 설정에서 키 재입력

상세 이력은 auto-memory `reference_news_alert_apk_distribution` 참조.

## 사용 승인 (h-license, 2.3.5~)
- 1회 사용 승인. 규격 `C:\H-Programs\h-license\GATE_SPEC.md`, 서버 lic.hyt.kr, 앱 id **`newsalert`**. Hoffice(`doc-viewer` License.kt/ActivationActivity.kt) 를 TS 로 옮긴 것
- `src/services/license.ts` (기기번호=SHA-256("newsalert:"+ANDROID_ID) 앞 8바이트, 열쇠 ECDSA P-256 DER 검증=@noble/curves, AsyncStorage `license.*` 저장, 7일마다 status 재확인→revoked 면 삭제)
- `src/screens/ActivationScreen.tsx` (신청 화면, 4초마다 status), `App.tsx` 의 `App` 이 게이트 → 승인되면 `MainApp`
- 게이트는 화면만 막는다. 승인 전에는 MainApp 의 푸시 등록·주기 체크가 안 돈다(이미 예약된 네이티브 NewsCheckWorker 알람은 별개)
- 시험 중 live `/api/request` 호출 금지(형님 텔레그램 알림). 검증 시험은 GATE_SPEC 의 "열쇠 검증 시험"
