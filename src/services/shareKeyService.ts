/**
 * 공유 코드 생성 / 해독
 * - 코드 = XOR 난독화 + Base64
 * - 직접 입력한 사용자만 생성 가능 (source === "manual")
 * - 공유받은 사용자는 재생성 버튼이 없어 재공유 불가 (UX 차단)
 */

const SALT = "NEWSALERT_SHARE_V1";
const PREFIX = "NA1:"; // 유효성 검증용 prefix

function xor(input: string, key: string): string {
  return input
    .split("")
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
    .join("");
}

export function generateShareCode(clientId: string, clientSecret: string): string {
  const payload = PREFIX + clientId + "|" + clientSecret;
  return btoa(xor(payload, SALT)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeShareCode(code: string): { clientId: string; clientSecret: string } | null {
  try {
    const normalized = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = xor(atob(padded), SALT);
    if (!decoded.startsWith(PREFIX)) return null;
    const inner = decoded.slice(PREFIX.length);
    const sep = inner.indexOf("|");
    if (sep < 1) return null;
    const clientId = inner.slice(0, sep);
    const clientSecret = inner.slice(sep + 1);
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}
