# 키워드 뉴스 푸시 알림

네이버 뉴스 API 로 키워드 검색 → 새 뉴스 발견 시 Expo Push 로 모바일 알림.

## 구성
- **PC 서버** — `news-push-server.py` (상시 실행, 키워드 검색 폴링)
- **모바일 앱** — React Native / Expo (`App.tsx`, `index.ts`, android/)
- **빌드 도구** — `eas.json`, `app.json`, `maven-proxy.js`, `download-deps.ps1`, `TestSSL.java`

## 실행
- 서버: `python news-push-server.py`
- 앱 빌드: `eas build --platform android` (Expo EAS)

## 수정 흐름
- 키워드/알림 설정 변경 → `news-push-server.py`
- 앱 UI 수정 → `App.tsx` + `npx expo start`
- Android 네이티브 이슈 → `android/` 및 `maven-proxy.js`

## 기밀
- 네이버 뉴스 API 클라이언트 ID/SECRET — 환경변수
- Expo Push Token — 서버가 DB/파일로 관리

## 알려진 이슈
- SSL 핸드셰이크 이슈로 `TestSSL.java` + `maven-proxy.js` 셋업 필요했음 (안드로이드 빌드 과정)
