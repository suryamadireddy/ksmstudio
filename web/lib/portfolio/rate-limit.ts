const requests = new Map<string, number[]>();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const HOUR_CAP = 30;
const DAY_CAP = 100;

export async function checkRateLimit(ip: string) {
  const now = Date.now();
  const history = (requests.get(ip) ?? []).filter((t) => now - t < DAY);
  const lastHour = history.filter((t) => now - t < HOUR).length;
  if (history.length >= DAY_CAP || lastHour >= HOUR_CAP) {
    return { ok: false };
  }
  history.push(now);
  requests.set(ip, history);
  return { ok: true };
}
