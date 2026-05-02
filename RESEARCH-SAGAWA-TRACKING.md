# RESEARCH: Sagawa Express (佐川急便 / 飛脚宅配便) Package Tracking

**Author:** Research agent (Claude)
**Date:** 2026-05-02
**Audience:** Bếp Thuỷ Japan engineering — `/thanh-vien` dashboard timeline feature
**Sister doc:** `RESEARCH-YAMATO-TRACKING.md` (Agent 2, parallel)

---

## Executive Summary

- **No public API.** Sagawa does not publish a developer REST/JSON API for tracking. The only first-party tracking surface is the consumer web page `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={number}`.
- **The page IS deep-linkable** via a single `okurijoNo` query parameter (10 or 12 digits, no hyphens). Up to 20 numbers can be queried at once with comma separation. Server-side rendered HTML — no JS required to read the events.
- **Two operational red flags for scraping.** `robots.txt` at `k2k.sagawa-exp.co.jp` explicitly disallows the `/p` path (the tracking endpoint). The result page sets `<meta name="ROBOTS" content="NONE">`. Sagawa's own terms request "do not link to this page directly for use other than Sagawa tracking service." Legal risk is non-zero; rate-aggressive scraping is likely to be blocked.
- **HTML uses Shift_JIS (Windows-31J)**, not UTF-8 — any scraper must decode `cp932` before parsing or Japanese text will be mojibake. CSS classes are stable: `table.table_basic.ttl02`, `span.state`, `dd#detail1` for the event list.
- **3rd-party aggregators cover Sagawa well.** AfterShip (free tier 50 shipments/month), TrackingMore, 17TRACK, ClickPost, Ship24. AfterShip is the most production-ready: ISO 27001, SOC 2, GDPR, sub-100ms response, 7-state normalized status taxonomy, webhooks.

### Recommendation

**Hybrid: deep-link first now, AfterShip API second when volume justifies it.**

Phase 1 (week 1, zero ops): Render an Amazon-style "Track on Sagawa" button that opens `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={number}` in a new tab. Store the tracking number in the order record. Zero scraping, zero API cost, zero TOS risk.

Phase 2 (when monthly orders > 30 and customers complain about leaving the dashboard): Sign up for AfterShip free tier, register Sagawa shipments via their REST API, render their normalized timeline inside `/thanh-vien` with Vietnamese status translations baked into our frontend.

Do **not** build a server-side scraper of `okurijosearch.do` for production. The robots.txt block + the explicit "do not link directly except for tracking service" clause + Shift_JIS handling + IP rate-limit risk make it the worst-of-three.

---

## 1. Public Tracking Page URL Pattern

### Standard URL (single shipment)

```
https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=1234567890
```

Or 12-digit:

```
https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=123456789012
```

### Multi-shipment URL (up to 20)

```
https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=1234567890,1234567891,1234567892
```

### Lightweight legacy endpoint (used during high-traffic events)

```
https://k2k.sagawa-exp.co.jp/cgi-bin/mall.mmcgi?oku01=NUM1&oku02=NUM2&oku03=NUM3
```

Use this only as a documented fallback. The primary endpoint is the `.do` URL.

### Language toggles

- Japanese (default): `/p/sagawa/web/okurijoinput.jsp` (input form), `/p/web/okurijosearch.do` (results)
- English UI: `/p/sagawa/web/okurijosearcheng.jsp` (input form only — results page returns Japanese-only labels even when navigated from the English form)

There is **no `?lang=en`** style query for the result page. English-only labels are not available natively; we must translate ourselves.

### HTML structure (results page)

Verified 2026-05-02 by direct fetch of `okurijosearch.do?okurijoNo=123456789012`:

```html
<html lang="ja">
<head>
  <meta charset="Windows-31J"><!-- Shift_JIS, NOT UTF-8 -->
  <meta name="ROBOTS" content="NONE"><!-- noindex/nofollow -->
  <link rel="stylesheet" href="/p/css/pc/okurijo_style.css?101" charset="UTF-8"/>
  ...
</head>
<body>
  ...
  <table class="table_basic ttl02">  <!-- summary row -->
    <tr>
      <th class="detail"><span class="detail_open">詳細1</span></th>
      <th class="number nowrap"><strong>{TRACKING_NUMBER}</strong></th>
      <th><span class="state">{STATUS_TEXT}</span></th>
    </tr>
  </table>
  <dd id="detail1">
    <table class="table_basic table_okurijo_detail2">
      <tbody>
        <tr><th>お問い合せ送り状No.</th><td>{TRACKING_NUMBER}</td></tr>
        <tr><th>出荷日</th>            <td>{SHIP_DATE}</td></tr>
        <tr><th>集荷に関するお問い合せ</th><td>{PICKUP_OFFICE} {PHONE}</td></tr>
        <tr><th>配達に関するお問い合せ</th><td>{DELIVERY_OFFICE} {PHONE}</td></tr>
        <tr><th>お荷物個数</th>          <td>{COUNT}</td></tr>
        <tr><th>詳細表示</th>            <td>{EVENT_TIMELINE_HTML}</td></tr>
      </tbody>
    </table>
  </dd>
}
```

When a tracking number is unknown the `<span class="state">` contains 「該当なし」 (Not applicable / not found) and the body contains 「恐れ入りますが、お問い合せ送り状No.をお確かめください」.

### Sagawa SGX (international)

International parcels use a separate system: `https://tracking.sagawa-sgx.com/sgx/keitaitrack.asp?enc=JPN&AWB={number}`. Bếp Thuỷ Japan ships domestic only, so this is out of scope but documented for completeness.

---

## 2. Public API

**Sagawa does not publish a public REST API for tracking.** Confirmed across:

- Sagawa's own developer/help pages (`sagawa-exp.co.jp/send/howto-search.html`) — no API mentioned.
- Multiple 3rd-party tracking aggregators all describe their Sagawa support as either screen-scraping or a private B2B feed they obtained via partnership, not as an SDK consumer of Sagawa's API.
- AfterShip's marketing page explicitly says "no Sagawa account required" — meaning they front the carrier integration, customers do not get one.

There is an **internal e-collect / Smart-Club B2B feed** (XML) available to enterprise shippers who sign a contract with Sagawa for bulk label printing. This is gated by a sales rep, requires a customer code (`お客様コード`), and is not appropriate for a small shipper like Bếp Thuỷ Japan. Skip.

### What exists for developers

| Channel | Type | Fit for Bếp Thuỷ Japan |
|---|---|---|
| Sagawa direct REST API | Does not exist publicly | n/a |
| Sagawa B2B e-collect XML | Enterprise contract only | No |
| `okurijosearch.do` HTML page | Public, scrapable but disallowed by robots | Risky |
| AfterShip aggregated API | Free 50/mo, paid tiers | Yes |
| TrackingMore aggregated API | Free tier exists | Yes |
| 17TRACK aggregated API | Free trial, then paid | Yes |
| ClickPost / Ship24 / Tracktry | Paid | Overkill |

---

## 3. Web Scraping Approach

### Feasibility

Technically simple — the page is server-rendered, deep-linkable by a single GET parameter, no auth, no captcha, no JS render needed for the data. **But disallowed.**

### Showstoppers

1. **`robots.txt` explicitly disallows `/p`.**

   Verified 2026-05-02 at `https://k2k.sagawa-exp.co.jp/robots.txt`:

   ```txt
   # go away
   User-agent: *
   Disallow: /p
   Disallow: /h
   Disallow: /pdt
   Disallow: /cgi-bin
   ...
   ```

   The `# go away` comment is unambiguous. The tracking endpoint `/p/web/okurijosearch.do` is under `/p`, so any compliant crawler must not fetch it.

2. **Result page declares `<meta name="ROBOTS" content="NONE">`.** Equivalent to `noindex, nofollow`.

3. **Sagawa's how-to-search page asks: "Please do not link to this page directly for use other than Sagawa tracking service."** A logged-in dashboard re-fetching events for our customers arguably falls under "for tracking service," but a *server-side scraper* cached and re-rendered without attribution is more legally exposed.

4. **Shift_JIS encoding.** Naive `fetch()` without explicit decoding produces mojibake. Add cost in every language runtime.

5. **No dedicated rate-limit headers.** Anecdotally, aggressive polling (>1 req/sec) leads to 503 / IP block within minutes. Aggregators throttle to ~1 req per tracking number per hour.

### If you absolutely must scrape (do not, but here is how)

```ts
// pseudocode — DO NOT use in production for Bếp Thuỷ Japan
import iconv from "iconv-lite";
import * as cheerio from "cheerio";

interface SagawaEvent {
  date: string;        // "2026/05/02"
  time: string;        // "14:32"
  status: string;      // "配達完了"
  office: string;      // "東京営業所"
}

async function scrapeSagawa(trackingNo: string): Promise<SagawaEvent[]> {
  const url =
    `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${trackingNo}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "ja,en-US;q=0.7",
    },
  });
  if (!res.ok) throw new Error(`Sagawa ${res.status}`);

  // CRITICAL: response is Shift_JIS (Windows-31J), not UTF-8
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, "Shift_JIS");
  const $ = cheerio.load(html);

  // Headline status (most-recent event) sits in span.state inside ttl02 table
  const headline = $("table.ttl02 span.state").first().text().trim();
  if (headline === "該当なし") return [];

  // Detailed event rows — Sagawa's "詳細表示" cell holds a sub-table where each
  // <tr> is one event with cells for date, time, status, and branch office.
  const events: SagawaEvent[] = [];
  $("dd#detail1 table.table_okurijo_detail2 tr").each((_, tr) => {
    const tds = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
    if (tds.length < 3) return;
    // Heuristic — verify shape against a real shipment before trusting in prod.
    events.push({
      date: tds[0],
      time: tds[1],
      status: tds[2],
      office: tds[3] ?? "",
    });
  });
  return events;
}
```

### Recommended scraping ground rules (only if Phase-3 forced)

- Cache aggressively: TTL ≥ 1 hour per tracking number.
- Throttle: max 1 req per tracking number per 30 min, max 5 req/min globally.
- Polite UA: include a contact email in the User-Agent so Sagawa can reach us before blocking.
- Respect 5xx + 429: exponential backoff, max 3 retries.
- Display a "Powered by 佐川急便 公開追跡ページ" attribution and a "Reload on Sagawa.co.jp" link.
- Server-side only — never call from the browser (CORS will block anyway and IP exposure is bad).

---

## 4. 3rd-Party Services

| Provider | Sagawa support | Free tier | Paid entry | Verdict for Bếp Thuỷ Japan |
|---|---|---|---|---|
| **AfterShip** | Yes, partnered direct feed | **50 shipments/mo free** | Essentials $11/mo (100 shipments), $0.08/extra | **Best fit.** SOC 2 + ISO 27001 + GDPR. Webhooks + REST. 7-status normalization. <100ms responses. |
| **TrackingMore** | Yes, scraper-aggregated | Limited free trial | from $9/mo | Good cheaper alt. SDKs in Node/Python/PHP/etc. |
| **17TRACK** | Yes | Free trial only | Variable | Massive carrier list (3,285) but enterprise-flavoured, less SMB-friendly |
| **ClickPost** | Yes | No | Quote-based | Enterprise. Skip. |
| **Ship24** | Yes | No | Paid | Skip. |
| **Parcels App** | Yes | Free consumer site | Paid API | Consumer site good for manual look-up, API is paid. |
| **TrackingMore-clone GitHub repos** | Wrappers around the above | n/a | n/a | Just wrappers, same limits. |

### AfterShip API — concrete shape

```
POST https://api.aftership.com/tracking/2024-04/trackings
Headers:
  as-api-key: {OUR_KEY}
  Content-Type: application/json

Body:
{
  "tracking": {
    "tracking_number": "1234567890",
    "slug": "sagawa",
    "title": "Order #BT-2026-001"
  }
}
```

Then poll or subscribe via webhook. Webhook payload is normalized to AfterShip's 7-state taxonomy: `Pending`, `InfoReceived`, `InTransit`, `OutForDelivery`, `AttemptFail`, `Delivered`, `Exception`, plus `Expired`.

### TrackingMore API — concrete shape

```
POST https://api.trackingmore.com/v4/trackings/create
Headers:
  Tracking-Api-Key: {OUR_KEY}
  Content-Type: application/json

Body:
{
  "tracking_number": "1234567890",
  "courier_code": "sagawa"
}
```

Statuses: `inforeceived`, `transit`, `pickup`, `undelivered`, `delivered`, `exception`, `expired`, `notfound`, `pending`. 180-day retention. Webhooks supported.

---

## 5. Carrier Comparison Data Structure

### Sagawa-specific raw event vocabulary (Japanese)

These are the strings that appear in `<span class="state">` and in the timeline rows. Sourced from Sagawa's own help page and the notosiki.co.jp reference article (2026-04 update).

| 日本語 | Romaji | English | Tiếng Việt | AfterShip status | Bếp Thuỷ Japan UI label |
|---|---|---|---|---|---|
| 荷物受付 | nimotsu-uketsuke | Package received at branch | Đã nhận tại bưu cục | InfoReceived | "Sagawa đã nhận hàng" |
| 集荷 | shūka | Collected (departed origin branch) | Đã lấy hàng | InfoReceived / InTransit | "Đã lấy hàng từ Bếp" |
| 輸送中 | yusōchū | In transit | Đang vận chuyển | InTransit | "Đang chuyển kho Sagawa" |
| 配達中 | haitatsu-chū | Out for delivery | Đang giao | OutForDelivery | "Đang giao đến anh/chị" |
| 持ち出し中 | mochidashi-chū | Out for delivery (variant) | Đang giao | OutForDelivery | "Đang giao đến anh/chị" |
| ご不在 | gofuzai | Recipient absent | Vắng nhà khi giao | AttemptFail | "Anh/chị vắng nhà — Sagawa sẽ giao lại" |
| 持ち帰り | mochikaeri | Returned to branch | Trả về bưu cục | AttemptFail | "Sagawa giữ tạm tại bưu cục" |
| 配達完了 | haitatsu-kanryō | Delivered | Đã giao thành công | Delivered | "Đã giao — chúc anh/chị ngon miệng!" |
| 保留中 | horyū-chū | On hold (contact Sagawa) | Tạm dừng | Exception | "Tạm dừng — em sẽ liên hệ Sagawa" |
| 該当なし | gaitō-nashi | Not found | Chưa có dữ liệu | Pending | "Chưa có cập nhật" |

### Recommended unified TypeScript schema (matches Yamato research)

```ts
// shared between Yamato + Sagawa adapters
type CarrierSlug = "yamato" | "sagawa";

type NormalizedStatus =
  | "info_received"
  | "in_transit"
  | "out_for_delivery"
  | "attempt_failed"
  | "delivered"
  | "on_hold"
  | "not_found";

interface TrackingEvent {
  timestamp: string;           // ISO 8601, JST normalized
  status: NormalizedStatus;
  rawStatus: string;           // original 配達完了 etc.
  rawStatusEn: string;         // English fallback
  location?: string;           // e.g. "東京営業所"
  carrier: CarrierSlug;
}

interface TrackingResult {
  carrier: CarrierSlug;
  trackingNumber: string;
  trackingUrl: string;         // deep-link to carrier site
  events: TrackingEvent[];     // newest-first
  estimatedDelivery?: string;
  fetchedAt: string;
}
```

### Vietnamese status copy for /thanh-vien (Amazon-style)

```ts
const VN_STATUS_COPY: Record<NormalizedStatus, { label: string; emoji: string; tone: "ok"|"warn"|"info"|"done" }> = {
  info_received:   { label: "Sagawa đã nhận hàng từ Bếp",          emoji: "",  tone: "info" },
  in_transit:      { label: "Đang vận chuyển",                       emoji: "",  tone: "info" },
  out_for_delivery:{ label: "Đang giao đến anh/chị hôm nay",         emoji: "",  tone: "ok"   },
  attempt_failed:  { label: "Anh/chị vắng nhà — sẽ giao lại",        emoji: "",  tone: "warn" },
  delivered:       { label: "Đã giao — chúc anh/chị ngon miệng!",    emoji: "",  tone: "done" },
  on_hold:         { label: "Tạm dừng — em sẽ liên hệ Sagawa giúp",  emoji: "",  tone: "warn" },
  not_found:       { label: "Sagawa chưa cập nhật — vui lòng đợi",   emoji: "",  tone: "info" },
};
```

(Emoji intentionally blank — anh Thắng/CLAUDE.md preference is no emoji unless requested.)

---

## 6. Implementation Recommendation

### Decision matrix

| Approach | Cost | Time-to-ship | Legal risk | UX quality | Maintenance | Score |
|---|---|---|---|---|---|---|
| Deep-link button | $0 | 2 hours | None | Adequate (opens new tab) | Zero | **9/10 for Phase 1** |
| Server-side scrape | $0 | 1-2 weeks | High (robots.txt + TOS) | Excellent | High (Shift_JIS, selector drift, IP blocks) | 3/10 |
| AfterShip API (free) | $0 ≤50/mo | 3 days | None | Excellent | Low | **8/10 for Phase 2** |
| AfterShip Essentials | $11/mo | 3 days | None | Excellent | Low | 7/10 (when volume warrants) |
| TrackingMore API | Free trial then $9+/mo | 3 days | None | Good | Low | 6/10 (cheaper but smaller team) |
| Manual entry by anh | $0 | 1 day | None | Bad (stale data) | High (anh's time) | 4/10 |

### Recommended phasing

**Phase 1 — ship this week (deep-link only).**

```tsx
// /thanh-vien order detail component
function SagawaTrackingButton({ trackingNo }: { trackingNo: string }) {
  if (!trackingNo) return null;
  const url = `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(trackingNo)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-track"
    >
      Tra cứu trên Sagawa &rarr;
    </a>
  );
}
```

Add a Sagawa logo + the tracking number rendered as `1234-5678-9012` (auto-hyphenate every 4 digits), the ship date from our DB, and a "Sagawa sẽ cập nhật trạng thái khi nhận hàng" placeholder. Customers click out, see the Japanese page, come back. Same UX Yodobashi/Amazon Japan/Rakuten ship with — Japanese customers expect this.

**Phase 2 — when volume crosses ~30 orders/month or anh receives "tôi không biết hàng đến đâu" complaints (~4 weeks out per current trajectory).**

Sign up for AfterShip free tier with thanghoang1109@gmail.com. Register a Sagawa shipment per order at fulfillment time. Either:

(a) Poll AfterShip via cron every 30 min for active shipments, store in a `shipment_events` table with a `(tracking_number, event_id)` unique key, render to dashboard.

(b) Subscribe to webhooks at `https://api.bep-thuy-japan.jp/webhooks/aftership` and update on event push (preferred; lower latency + lower request count).

Render events using the unified `TrackingEvent[]` schema above with `VN_STATUS_COPY`. Keep the deep-link button visible as a fallback ("Xem chi tiết trên Sagawa").

**Phase 3 — never (do not scrape).**

If AfterShip free tier becomes insufficient and paid tier is unaffordable, switch to TrackingMore or stay on deep-link only. Do not run a server-side scraper of `okurijosearch.do`. The TOS, robots.txt, and Shift_JIS overhead make it a bad bet relative to a $11/mo paid tier.

### Cross-carrier consistency

`/thanh-vien` will show Yamato AND Sagawa shipments. Use the unified `TrackingResult` schema in §5, write one adapter per carrier, keep the React timeline component carrier-agnostic. Customer should not be able to tell scrolled timeline came from a different source.

---

## 7. Sample Tracking Number Format

**Do NOT use a real customer's number — formats only:**

- **10 digits:** `XXXXXXXXXX` (e.g. `1234567890`) — older / shorter form
- **12 digits:** `XXXXXXXXXXXX` (e.g. `123456789012`) — current standard
- **Display convention:** typically rendered as 4-4-4 hyphenated for readability: `1234-5678-9012`. Sagawa accepts the number with or without hyphens; the URL parameter requires no hyphens.
- **Where it appears:** printed on the 送り状 (waybill) under 「お問い合せ送り状No.」 — the top-right of the address label.
- **Validity window:** Sagawa keeps records for **60 days from the day after shipping**. Beyond that the tracking page returns 該当なし.

Validation regex:

```ts
const SAGAWA_TRACKING_RE = /^\d{10}(\d{2})?$/;  // 10 or 12 digits, no other separators

function normalizeSagawaNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return SAGAWA_TRACKING_RE.test(digits) ? digits : null;
}

function displaySagawaNumber(digits: string): string {
  // 1234-5678-9012 or 12-3456-7890
  if (digits.length === 12) return digits.match(/.{1,4}/g)!.join("-");
  if (digits.length === 10) return `${digits.slice(0,2)}-${digits.slice(2,6)}-${digits.slice(6)}`;
  return digits;
}
```

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Sagawa changes URL pattern, deep-link breaks | Low | High (button dead) | Health-check job that pings the URL nightly with a known number; on 4xx/5xx, alert anh + show fallback "vui lòng vào sagawa-exp.co.jp" |
| R2 | If we scrape: IP block | High | High | Don't scrape. If forced, throttle hard, polite UA, server-side only. |
| R3 | If we scrape: legal complaint from Sagawa over TOS violation | Low | High (forced takedown / fine) | Don't scrape. |
| R4 | If we scrape: HTML selectors drift, parser breaks silently | Medium | Medium | Snapshot test against a known shipment number weekly; alert on diff |
| R5 | AfterShip free tier exceeded silently | Medium | Medium | Track shipments_this_month counter in our DB; alert anh at 40/50 |
| R6 | AfterShip outage | Low | Medium | Always render deep-link button as a fallback regardless of API state |
| R7 | Tracking number entered wrong by anh, customer sees "không tìm thấy" | Medium | Medium | Validate format with regex on entry; show last-3-digits confirmation modal before saving |
| R8 | 60-day data retention exceeded for old orders | Medium | Low | Warn customer in UI: "Dữ liệu Sagawa chỉ lưu 60 ngày sau gửi"; archive snapshot when status hits Delivered |
| R9 | Shift_JIS decoding bug on scraping path corrupts Japanese chars | Low (we recommend not scraping) | Low | Use `iconv-lite` with `Shift_JIS`; unit test with fixture HTML |
| R10 | Customer privacy: tracking number is mildly PII | Low | Low | Don't expose in URLs we control; render only inside authenticated /thanh-vien |
| R11 | Phase 2 webhook secret leak | Low | High | Store AfterShip webhook secret in env, verify HMAC on every request |
| R12 | Cross-carrier UI confusion (different vocab from Yamato vs Sagawa) | Medium | Low | Use unified `NormalizedStatus` + `VN_STATUS_COPY` from §5 — never show raw Japanese |

---

## Appendix A: Verified facts (fetched 2026-05-02)

- `https://k2k.sagawa-exp.co.jp/robots.txt` returns `Disallow: /p` (and others). Comment: `# go away`.
- `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=123456789012` returns HTTP 200 with Shift_JIS HTML body. `<meta charset="Windows-31J">`. `<meta name="ROBOTS" content="NONE">`.
- Result page renders the empty-result state with `<span class="state">該当なし</span>` inside `table.table_basic.ttl02`.
- Detail block lives inside `<dd id="detail1">` with class `table_okurijo_detail2`.
- English tracking input form exists at `/p/sagawa/web/okurijosearcheng.jsp` but redirects to the same Japanese-only result page.

## Appendix B: Sources

- Sagawa Express official tracking input (Japanese): https://k2k.sagawa-exp.co.jp/p/sagawa/web/okurijoinput.jsp
- Sagawa Express official tracking input (English): https://k2k.sagawa-exp.co.jp/p/sagawa/web/okurijosearcheng.jsp
- Sagawa Express how-to-search help page: https://www.sagawa-exp.co.jp/send/howto-search.html
- Sagawa robots.txt: https://k2k.sagawa-exp.co.jp/robots.txt
- AfterShip Sagawa carrier page: https://www.aftership.com/carriers/sagawa
- AfterShip API docs entry: https://www.aftership.com/carriers/sagawa/api
- AfterShip pricing 2026: https://www.aftership.com/pricing/tracking
- TrackingMore Sagawa API: https://www.trackingmore.com/sagawa-tracking-api
- 17TRACK Sagawa: https://www.17track.net/en/carriers/sagawa-%E4%BD%90%E5%B7%9D%E6%80%A5%E4%BE%BF
- ParcelsApp Sagawa: https://parcelsapp.com/en/carriers/sagawa-jp
- ClickPost Sagawa: https://www.clickpost.ai/carrier-integration/sagawa
- shlee322/delivery-tracker (open-source carrier scrapers): https://github.com/shlee322/delivery-tracker
- clooney/sagawa-tracking-api (TrackingMore wrapper): https://github.com/clooney/sagawa-tracking-api
- Status code reference (Notosiki blog): https://www.notosiki.co.jp/blog/other/sagawa-tracking/
- Tracking-URL builder reference (jdash.info): https://jdash.info/archives/Make_the_Tracking_URL
