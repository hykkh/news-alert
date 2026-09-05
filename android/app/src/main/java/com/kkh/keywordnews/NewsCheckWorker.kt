package com.kkh.keywordnews

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

class NewsCheckWorker : BroadcastReceiver() {
    companion object {
        private const val TAG = "NewsCheck"
        private const val CHANNEL_ID = "news-alerts"
        private const val PREFS_NAME = "news_checker_prefs"
        private const val DEFAULT_INTERVAL_MINUTES = 15

        // BuildConfig는 fallback — 앱 설정에서 입력한 값이 우선
        private val BUILT_IN_CLIENT_ID = BuildConfig.NAVER_CLIENT_ID
        private val BUILT_IN_CLIENT_SECRET = BuildConfig.NAVER_CLIENT_SECRET

        fun schedule(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val intervalMinutes = prefs.getInt("check_interval_minutes", DEFAULT_INTERVAL_MINUTES)
            val intervalMs = intervalMinutes * 60 * 1000L

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, NewsCheckWorker::class.java)
            intent.action = "com.kkh.keywordnews.NEWS_CHECK"
            val pendingIntent = PendingIntent.getBroadcast(
                context, 1001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerTime = System.currentTimeMillis() + intervalMs
            // 안드로이드 12(S)+ 에서는 SCHEDULE_EXACT_ALARM 권한이 없으면 정확 알람이
            // SecurityException 을 던진다. 클린 설치된 폰은 이 권한이 기본 거부이므로
            // 권한 여부를 확인하고, 없으면 부정확 알람으로 폴백한다. (앱 시작 크래시 방지)
            try {
                val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                    alarmManager.canScheduleExactAlarms()
                if (canExact) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                    Log.i(TAG, "다음 정확 알람 예약: ${intervalMs / 60000}분 후")
                } else {
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                    Log.i(TAG, "정확 알람 권한 없음 → 부정확 알람 예약: ${intervalMs / 60000}분 후")
                }
            } catch (e: SecurityException) {
                // 일부 기기/OS 에서 권한 체크를 통과해도 호출 시 거부될 수 있어 한 번 더 방어
                try {
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                    Log.i(TAG, "SecurityException → 부정확 알람으로 폴백")
                } catch (e2: Exception) {
                    Log.e(TAG, "알람 예약 최종 실패: ${e2.message}")
                }
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "=== 알람 수신 ===")

        // 즉시 다음 알람 예약 (작업 실패해도 다음 알람은 보장)
        schedule(context)

        // goAsync로 프로세스 유지
        val pendingResult = goAsync()

        // WakeLock 획득
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "keywordnews:check")
        wakeLock.acquire(60 * 1000L)

        Thread {
            try {
                createNotificationChannel(context)

                // 방해금지 체크
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                if (prefs.getBoolean("quiet_enabled", false)) {
                    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
                    val start = prefs.getInt("quiet_start", 22)
                    val end = prefs.getInt("quiet_end", 9)
                    val isQuiet = if (start < end) hour in start until end else hour >= start || hour < end
                    if (isQuiet) {
                        Log.i(TAG, "방해금지 시간 - 스킵")
                        return@Thread
                    }
                }

                // 키워드 읽기 (비어있으면 알람 스킵 — 하드코딩 기본값 쓰지 않음)
                val keywordsJson = prefs.getString("keywords", null)
                val keywords = if (keywordsJson != null) {
                    try {
                        val arr = JSONArray(keywordsJson)
                        (0 until arr.length()).map { arr.getString(it) }
                    } catch (e: Exception) { emptyList() }
                } else emptyList()

                if (keywords.isEmpty()) {
                    Log.i(TAG, "등록된 키워드 없음 - 스킵")
                    return@Thread
                }
                Log.i(TAG, "키워드: $keywords")

                // 본 뉴스 기록 읽기 — 순서 보존(LinkedHashSet + JSON).
                // 기존엔 StringSet(순서 없음)에 저장하고 takeLast(500)로 잘라, 순서가 없으니
                // 최근 본 뉴스가 임의로 잘려나가 다시 "새 뉴스"로 재알림되는 중복 버그가 있었다.
                val seen = LinkedHashSet<String>()
                val seenJson = prefs.getString("seen_list", null)
                if (seenJson != null) {
                    try {
                        val a = JSONArray(seenJson)
                        for (i in 0 until a.length()) seen.add(a.getString(i))
                    } catch (e: Exception) {}
                } else {
                    // 구버전 StringSet 데이터 1회 흡수
                    prefs.getStringSet("seen_hashes", null)?.let { seen.addAll(it) }
                }
                val seenTitles = mutableSetOf<String>()
                var notifId = (System.currentTimeMillis() % 100000).toInt()
                var newCount = 0

                for (kw in keywords) {
                    try {
                        val items = fetchNews(context, kw)
                        Log.i(TAG, "[$kw] ${items.size}건 검색")
                        for (item in items) {
                            val title = item.first
                            val link = item.second
                            val hash = md5(normalize(title))

                            if (hash in seen) continue
                            val norm = normalize(title)
                            if (norm in seenTitles) { seen.add(hash); continue }

                            seenTitles.add(norm)
                            seen.add(hash)
                            newCount++

                            sendNotif(context, notifId++, "[$kw] 새 뉴스", title, link)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "[$kw] 검색 실패: ${e.message}")
                    }
                }

                // 본 뉴스 기록 저장 — 순서대로 최근 1000개 유지(오래된 것부터 제거, 최근 것 확실히 보존).
                // commit() 동기 저장(BroadcastReceiver 프로세스가 곧 종료돼도 유실 없게).
                val kept = if (seen.size > 1000) seen.toList().takeLast(1000) else seen.toList()
                val arr = JSONArray()
                kept.forEach { arr.put(it) }
                prefs.edit().putString("seen_list", arr.toString()).commit()

                Log.i(TAG, "완료: 새 뉴스 ${newCount}건 (기록 ${kept.size}개)")
            } catch (e: Exception) {
                Log.e(TAG, "전체 오류: ${e.message}")
            } finally {
                if (wakeLock.isHeld) wakeLock.release()
                pendingResult.finish()
            }
        }.start()
    }

    private fun fetchNews(context: Context, keyword: String): List<Pair<String, String>> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val clientId = prefs.getString("naver_client_id", BUILT_IN_CLIENT_ID)?.takeIf { it.isNotBlank() } ?: BUILT_IN_CLIENT_ID
        val clientSecret = prefs.getString("naver_client_secret", BUILT_IN_CLIENT_SECRET)?.takeIf { it.isNotBlank() } ?: BUILT_IN_CLIENT_SECRET

        val encoded = URLEncoder.encode(keyword, "UTF-8")
        val url = URL("https://openapi.naver.com/v1/search/news.json?query=$encoded&display=5&sort=date")
        val conn = url.openConnection() as HttpURLConnection
        conn.setRequestProperty("X-Naver-Client-Id", clientId)
        conn.setRequestProperty("X-Naver-Client-Secret", clientSecret)
        conn.connectTimeout = 10000
        conn.readTimeout = 10000
        return try {
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().readText()
                val items = JSONObject(body).getJSONArray("items")
                (0 until items.length()).map { i ->
                    val obj = items.getJSONObject(i)
                    val title = obj.getString("title").replace(Regex("<[^>]*>"), "")
                        .replace("&quot;", "\"").replace("&amp;", "&")
                    val link = obj.optString("originallink", obj.getString("link"))
                    Pair(title, link)
                }
            } else emptyList()
        } finally { conn.disconnect() }
    }

    private fun normalize(title: String) =
        title.replace(Regex("[^\\uAC00-\\uD7A3a-zA-Z0-9]"), "").lowercase()

    private fun md5(input: String): String {
        val bytes = java.security.MessageDigest.getInstance("MD5").digest(input.toByteArray())
        return bytes.take(6).joinToString("") { "%02x".format(it) }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(CHANNEL_ID, "뉴스 알림", NotificationManager.IMPORTANCE_HIGH)
                ch.enableVibration(true)
                nm.createNotificationChannel(ch)
            }
        }
    }

    private fun sendNotif(context: Context, id: Int, title: String, body: String, url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        val pi = PendingIntent.getActivity(
            context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, notif)
        Log.i(TAG, "알림 발송: $title")
    }
}
