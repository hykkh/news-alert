"""
키워드 뉴스 푸시 서버
- PC에서 상시 실행
- 네이버 뉴스 API로 키워드 검색
- 새 뉴스 발견 시 Expo Push로 폰에 알림 전송
- 앱이 꺼져있어도 알림이 옴
"""

import json
import time
import hashlib
import logging
import urllib.request
import urllib.parse
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import re

# ── 설정 ──
SCRIPT_DIR = Path(__file__).parent
STATE_FILE = SCRIPT_DIR / "push-server-state.json"
LOG_FILE = SCRIPT_DIR / "push-server.log"

def _load_env(path):
    if not path.is_file(): return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
            k, v = line.split("=", 1)
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k and k not in os.environ: os.environ[k] = v

import os
for _ep in [SCRIPT_DIR / ".env", Path.home() / "OneDrive" / "claude-sync" / "news-alert" / ".env"]:
    if _ep.is_file(): _load_env(_ep); break

NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "")
if not NAVER_CLIENT_ID:
    print("[FATAL] NAVER_CLIENT_ID not set. .env 파일을 확인하세요.", flush=True)
    import sys; sys.exit(1)

CHECK_INTERVAL = 5 * 60  # 5분마다 체크
TOKEN_SERVER_PORT = 8889

KEYWORDS_FILE = SCRIPT_DIR / "push-keywords.json"

# ── 로깅 ──
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── 상태 관리 ──
def load_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"seen_hashes": [], "push_token": None}

def save_state(state: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def load_keywords() -> list:
    if KEYWORDS_FILE.exists():
        with open(KEYWORDS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    default = ["삼성전자", "AI"]
    save_keywords(default)
    return default

def save_keywords(keywords: list):
    with open(KEYWORDS_FILE, "w", encoding="utf-8") as f:
        json.dump(keywords, f, ensure_ascii=False, indent=2)

# ── 글로벌 상태 ──
g_state = load_state()

# ── 토큰 수신 HTTP 서버 ──
class TokenHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        global g_state
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

        if self.path == "/register-token":
            token = body.get("token", "")
            if token.startswith("ExponentPushToken"):
                g_state["push_token"] = token
                save_state(g_state)
                log.info(f"푸시 토큰 등록 완료: {token[:40]}...")
                self._send_json(200, {"ok": True})
                return

        elif self.path == "/update-keywords":
            keywords = body.get("keywords", [])
            if isinstance(keywords, list):
                keywords = [str(k).strip() for k in keywords if str(k).strip()]
                save_keywords(keywords)
                log.info(f"키워드 업데이트: {keywords}")
                self._send_json(200, {"ok": True, "keywords": keywords})
                return

        self._send_json(400, {"ok": False, "error": "unknown endpoint"})

    def do_GET(self):
        if self.path == "/status":
            self._send_json(200, {
                "push_token": bool(g_state.get("push_token")),
                "keywords": load_keywords(),
                "seen_count": len(g_state.get("seen_hashes", [])),
            })
            return
        elif self.path == "/keywords":
            self._send_json(200, {"keywords": load_keywords()})
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # 액세스 로그 숨기기

def start_token_server():
    server = HTTPServer(("0.0.0.0", TOKEN_SERVER_PORT), TokenHandler)
    log.info(f"토큰 수신 서버: http://0.0.0.0:{TOKEN_SERVER_PORT}")
    server.serve_forever()

# ── 뉴스 검색 ──
def strip_html(text: str) -> str:
    text = re.sub(r'<[^>]*>', '', text)
    text = text.replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text

def search_news(keyword: str, display: int = 5) -> list:
    url = f"https://openapi.naver.com/v1/search/news.json?query={urllib.parse.quote(keyword)}&display={display}&sort=date"
    req = urllib.request.Request(url, headers={
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    items = []
    for item in data.get("items", []):
        items.append({
            "title": strip_html(item["title"]),
            "link": item["link"],
            "originallink": item.get("originallink", item["link"]),
        })
    return items

def normalize_title(title: str) -> str:
    return re.sub(r'[^\uAC00-\uD7A3a-zA-Z0-9]', '', title).lower()

def title_hash(title: str) -> str:
    return hashlib.md5(normalize_title(title).encode()).hexdigest()[:12]

# ── Expo Push 전송 ──
def send_expo_push(token: str, title: str, body: str, data: dict = None) -> bool:
    message = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
        "channelId": "news-alerts",
        "priority": "high",
    }
    payload = json.dumps([message]).encode("utf-8")
    req = urllib.request.Request(
        "https://exp.host/--/api/v2/push/send",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if result.get("data") and result["data"][0].get("status") == "ok":
                return True
            log.error(f"푸시 실패: {result}")
            return False
    except Exception as e:
        log.error(f"푸시 오류: {e}")
        return False

# ── 뉴스 확인 ──
def check_and_notify() -> int:
    global g_state
    token = g_state.get("push_token")
    if not token:
        return 0

    keywords = load_keywords()
    if not keywords:
        return 0

    seen = set(g_state.get("seen_hashes", []))
    new_count = 0
    new_hashes = []
    seen_titles = set()

    all_items = []
    for kw in keywords:
        try:
            items = search_news(kw, 5)
            for item in items:
                all_items.append({**item, "keyword": kw, "hash": title_hash(item["title"])})
        except Exception as e:
            log.error(f'키워드 "{kw}" 검색 실패: {e}')

    for item in all_items:
        if item["hash"] in seen:
            continue
        norm = normalize_title(item["title"])
        if norm in seen_titles:
            new_hashes.append(item["hash"])
            continue

        seen_titles.add(norm)
        new_hashes.append(item["hash"])
        new_count += 1

        if send_expo_push(token, f'[{item["keyword"]}] 새 뉴스', item["title"], {"url": item["originallink"]}):
            log.info(f'알림: [{item["keyword"]}] {item["title"][:40]}')
        time.sleep(0.3)

    if new_hashes:
        all_hashes = list(seen) + new_hashes
        g_state["seen_hashes"] = all_hashes[-1000:]
        save_state(g_state)

    return new_count

def safe_print(text: str):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("utf-8", errors="replace").decode("utf-8", errors="replace"))

def main():
    global g_state
    keywords = load_keywords()

    safe_print("=" * 50)
    safe_print("  [NEWS] 키워드 뉴스 푸시 서버")
    safe_print("=" * 50)
    safe_print(f"  키워드: {', '.join(keywords)}")
    safe_print(f"  체크 주기: {CHECK_INTERVAL // 60}분")
    safe_print(f"  토큰 수신: http://0.0.0.0:{TOKEN_SERVER_PORT}")
    if g_state.get("push_token"):
        safe_print(f"  푸시 토큰: 등록됨")
    else:
        safe_print(f"  푸시 토큰: 미등록 (앱을 한번 실행하세요)")
    safe_print("=" * 50)
    safe_print("")

    # 토큰 수신 HTTP 서버를 별도 스레드로 실행
    t = threading.Thread(target=start_token_server, daemon=True)
    t.start()

    while True:
        try:
            new_count = check_and_notify()
            now = datetime.now().strftime("%H:%M:%S")
            if not g_state.get("push_token"):
                log.info(f"[{now}] 푸시 토큰 대기 중... (앱을 한번 실행하세요)")
            elif new_count > 0:
                log.info(f"[{now}] 새 뉴스 {new_count}건 알림 전송 완료")
            else:
                log.info(f"[{now}] 새 뉴스 없음")
        except Exception as e:
            log.error(f"오류: {e}")

        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    main()
