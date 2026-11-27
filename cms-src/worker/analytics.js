// Visitor logging. Scope, stated honestly:
// - records: time, page path, referrer, user-agent, country (from Cloudflare's
//   network layer — no IP is stored)
// - bot classification is UA-based: self-declared search engines and common
//   crawlers are recognized; bots that perfectly imitate a browser are not.
//   Numbers are trends, not exact people counts.

const SE_BOTS = /googlebot|bingbot|baiduspider|yandex(bot|images)|duckduckbot|slurp|sogou|exabot|applebot/i;
const OTHER_BOTS = /bot|crawler|spider|scraper|curl|wget|python-requests|httpclient|headlesschrome|phantomjs|lighthouse|pingdom|uptime/i;

export function classify(ua) {
  if (!ua) return 'bot';
  if (SE_BOTS.test(ua)) return 'se-bot';
  if (OTHER_BOTS.test(ua)) return 'bot';
  return 'human';
}

export function logPageView(ctx, env, request, path) {
  const ua = request.headers.get('user-agent') || '';
  const ref = request.headers.get('referer') || '';
  const country = (request.cf && request.cf.country) || '';
  const bot = classify(ua);
  const test = /\[test\]|test-visit/i.test(ref) ? 1 : 0;
  const stmt = env.DB.prepare(
    'INSERT INTO page_views (path, referrer, ua, country, bot_type, is_test) VALUES (?,?,?,?,?,?)')
    .bind(path.slice(0, 200), ref.slice(0, 300), ua.slice(0, 300), country, bot, test);
  ctx.waitUntil(stmt.run().catch(() => {}));
}
