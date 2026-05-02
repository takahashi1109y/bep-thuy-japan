# RESEARCH: Yamato 宅急便 (Kuroneko Yamato) Package Tracking

**Author:** AI research pass
**Date:** 2026-05-02
**Purpose:** Feasibility study for displaying Yamato Cool tracking events in the `/thanh-vien` dashboard (Amazon-style timeline) of Bếp Thuỷ Japan.
**Volume:** ~200-800 orders/month

---

## Executive Summary

- **No public REST API exists for Yamato tracking.** Yamato has never published a free, open developer API. Their B2 Cloud API exists for shipping label issuance — but tracking is consumer-only via the public web tracking page. (Sources: AfterShip, TrackingMore both list tracking via scraping/aggregation, never via official Yamato API.)
- **The legacy public tracking page `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko` is server-rendered HTML and accepts both POST (10 numbers at a time) and GET-via-querystring (one number).** It is scrapable. Selectors are stable enough that a 12-year-old GitHub library (`wktk/kuroneko`) still uses the same approach: `table.saisin` (latest summary) and `table.meisai` (history detail).
- **Since April 2024, Yamato has been migrating customers toward the new portal `https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=...` — but this requires KMS member login and is NOT a viable scraping target.** The legacy `/cgi-bin/tneko` still works as of 2026 and is the de-facto choice for unauthenticated tracking.
- **3rd-party APIs are expensive for our volume.** ParcelsApp (cheapest viable) charges $29/mo for 500/mo or $49/mo for 1000/mo. AfterShip Essentials ($11/mo base + $0.08/shipment overage) effectively reaches ~$40-65/mo at our volume. EasyPost lists Yamato as a tracked carrier at $0.01-0.03/shipment, but is US-centric and has limited Japanese-language event detail.
- **RECOMMENDATION: Hybrid Option A + D.** (1) Server-side scrape via Apps Script `UrlFetchApp.fetch()` of the legacy `tneko` endpoint, parsing `table.meisai` rows into our timeline. (2) Always render a "Mở trên Yamato" deep-link button for the customer to verify on Yamato's official page (also serves as fallback when scraping fails). Cache scrape result for 1-2 hours per tracking number to reduce request load. Estimated effort: 1-2 days build + 0.5 day translation table. **Cost: zero recurring.** Falls back gracefully to Option D if Yamato changes their HTML.

---

## 1. Public Tracking Page URL Pattern

### 1.1 Legacy endpoint (still active — recommended)

```
Endpoint:  https://toi.kuronekoyamato.co.jp/cgi-bin/tneko
Method 1:  GET with querystring  (1 tracking number)
           https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number00=1&number01=1234-5678-9012
Method 2:  POST application/x-www-form-urlencoded  (up to 10 numbers)
           number00=1   ← "1" means "show detailed events"; omit/0 = summary only
           number01=1234-5678-9012
           number02=...
           ...
           number10=...
```

`number11` and beyond are silently ignored. Slots may be sparse (e.g. only `number05`).

### 1.2 New portal (April 2024+)

```
https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=<tracking>
```

This page is a **JavaScript SPA behind KMS login.** Not scrapable without authenticated session cookies. Yamato has been pushing customers here, but the legacy `tneko` URL remains functional for the foreseeable future and is the recommended path for our automation.

### 1.3 Other related URLs (for reference, NOT recommended)

| URL | Use | Notes |
|---|---|---|
| `https://jizen.kuronekoyamato.co.jp/jizen/servlet/crjz.b.NQ0010?id=<tracking>` | Older deep-link redirect | Redirects to `tneko`. Less reliable. |
| `https://track.kuronekoyamato.co.jp/english/tracking` | Official English tracking | Form-only. No GET deep-link — tracking number must be POSTed. Use as fallback display URL only. |
| `https://global.igsp-kuronekoyamato.com/tracking` | International TA-Q-BIN | Different system, not relevant for domestic JP shipments. |

### 1.4 What's on the page (HTML structure)

The legacy `/cgi-bin/tneko` response is **server-rendered HTML in Shift_JIS** (no JavaScript needed to view content). Key structural elements (verified from the `wktk/kuroneko` Ruby parser, which is the canonical open-source reference):

```html
<!-- Latest status summary, one per tracked number -->
<table class="saisin">
  <tr><td>...</td><td>...</td><td>1234-5678-9012</td></tr>  <!-- row 1 col 3 = tracking number -->
  <tr><td>...</td><td>...</td><td>配達完了</td></tr>          <!-- row 2 col 3 = latest status name -->
</table>

<!-- Event history detail -->
<table class="meisai">
  <tr>
    <td><img src=".../current.gif"></td>  <!-- if img matches "current", this row is the latest -->
    <td>配達完了</td>                       <!-- status -->
    <td>04/29</td>                         <!-- date MM/DD -->
    <td>17:23</td>                         <!-- time HH:MM -->
    <td>センター北センター</td>              <!-- branch (location) -->
    <td>030990</td>                        <!-- branch code -->
  </tr>
  ... more rows ...
</table>
```

When a tracking number is invalid or not yet registered, the page returns a flat HTML message and no `table.meisai` element — easy to detect.

### 1.5 Multi-language support

- The `/cgi-bin/tneko` page is **Japanese only.** The status names are in Japanese kanji. We must maintain our own JP→EN→VI translation table (see §5).
- The English tracking portal (`track.kuronekoyamato.co.jp/english/tracking`) translates the labels but is form-only and cannot be scraped via deep-link.
- Conclusion: scrape Japanese, translate ourselves.

---

## 2. Public API Availability

| Aspect | Finding |
|---|---|
| Official Yamato REST API for tracking | **None.** No developer portal, no key issuance. |
| B2 Cloud API | Exists for **label issuance** only. Requires a Yamato business account (法人契約) and is intended for shippers, not for tracking customer-facing parcels. |
| Free tier | N/A |
| Auth required | N/A |
| Documentation | None publicly. Partners like Ship&co integrate B2 Cloud under contract. |

**Verdict:** No first-party API path for our use case. Must use scraping or 3rd-party aggregator.

---

## 3. Web Scraping Approach

### 3.1 Method

```ts
// Apps Script (Google) pseudocode — Option A
function fetchYamatoEvents(trackingNo: string): TrackingEvent[] {
  const url = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko';
  const payload = {
    number00: '1',          // request detailed history
    number01: trackingNo    // can extend up to number10 for batch
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload,
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BepThuyTracker/1.0; +https://bepthuy.jp)',
      'Accept-Language': 'ja,en;q=0.8',
    },
    followRedirects: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Yamato HTTP ${response.getResponseCode()}`);
  }

  // Yamato returns Shift_JIS — Apps Script: getContentText('Shift_JIS')
  const html = response.getContentText('Shift_JIS');
  return parseMeisai(html);
}

function parseMeisai(html: string): TrackingEvent[] {
  // Regex approach (Apps Script has no Cheerio):
  // 1. Find <table class="meisai"> ... </table>
  const tableMatch = html.match(/<table[^>]*class="meisai"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  const events: TrackingEvent[] = [];
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableMatch[1])) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 6) continue;     // header row or empty

    // [0] = current marker (img tag), [1] = status JP, [2] = date MM/DD,
    // [3] = time HH:MM, [4] = branch name, [5] = branch code
    const isLatest = /current|now|saisin/i.test(rowMatch[1]);
    events.push({
      isLatest,
      statusJP: cells[1],
      statusVI: STATUS_VI[cells[1]] ?? cells[1],
      date: cells[2],
      time: cells[3],
      location: cells[4],
      branchCode: cells[5],
    });
  }
  return events;
}
```

### 3.2 Selectors / fields

| Field | Source | Format |
|---|---|---|
| Tracking number | `table.saisin` row 1, cell 3 | `1234-5678-9012` (strip non-digits → 12 digits) |
| Latest status | `table.saisin` row 2, cell 3 | Japanese, e.g. `配達完了` |
| Event status | `table.meisai` row N, cell 2 | Japanese |
| Event date | `table.meisai` row N, cell 3 | `MM/DD` (no year — must infer from current date) |
| Event time | `table.meisai` row N, cell 4 | `HH:MM` |
| Branch (location) | `table.meisai` row N, cell 5 | Japanese, e.g. `センター北センター` |
| Branch code | `table.meisai` row N, cell 6 | Numeric ID |
| Is-latest flag | `<img>` src in cell 1 | True if matches "current" indicator image |

### 3.3 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| HTML structure change (selectors break) | MEDIUM. Page has been stable 10+ years per `wktk/kuroneko` library, but there is no SLA. | Monitor parse-success rate. Fall back to deep-link (Option D) if `table.meisai` not found. Alert admin via email. |
| Rate limiting / IP block | LOW for our volume. 200-800 calls/month is trivial. Apps Script egress IP rotates through Google IPs. | Cache results 1-2 hrs per tracking number in Sheets. Throttle to ≤1 request/sec. Use realistic User-Agent. |
| Shift_JIS encoding bugs | MEDIUM | Always pass `'Shift_JIS'` to `getContentText()`. Test with mojibake-prone status names like `持戻`. |
| JS rendering required | NO. The legacy page is fully server-rendered. Confirmed via inspection of HTTP response. | None needed. |
| robots.txt / ToS violation | LOW. Page has no robots.txt blocks for `/cgi-bin/tneko`. ToS does not explicitly prohibit personal tracking aggregation. | Stay under low volume; don't redistribute. Show data only to the order's owning customer. |
| Migration to KMS portal | MEDIUM-LONG-TERM. Yamato may eventually deprecate `tneko`. | Build with provider abstraction (`TrackingProvider` interface) so we can swap to a 3rd-party aggregator later without UI changes. |

### 3.4 No JavaScript rendering needed

The legacy `tneko` page is plain HTML. No headless browser required. This is critical — Apps Script `UrlFetchApp` cannot run JavaScript, but our target endpoint doesn't need it.

---

## 4. 3rd-Party Services Comparison

| Service | Yamato Japan supported | Pricing for 200-800 shipments/mo | Webhook | Notes |
|---|---|---|---|---|
| **AfterShip** | Yes | Essentials $11/mo + $0.08/shipment overage → ~$27/mo @ 200, ~$75/mo @ 800. API access requires Essentials+. | Yes | Most mature. Excellent translation. Overage charges add up. |
| **TrackingMore** | Yes (taqbin-jp) | Free trial only; paid plans not transparently published — typically ~$9-49/mo bands similar to ParcelsApp. | Yes | Comparable to ParcelsApp. Webhook in standard plan. |
| **17TRACK** | Yes | $9/mo entry; 100 free quota for testing. Unclear how many tracked at $9 tier. | Yes (paid) | China-based aggregator. Sometimes lags on JP-domestic events. |
| **ParcelsApp** | Yes (yamato-japan) | $9/100, $19/300, **$29/500**, $49/1000 | Not advertised in tiers shown | Most transparent pricing. **Best fit for our volume range** if going 3rd-party. |
| **EasyPost** | Yes (Kuroneko Yamato listed) | $0.01-0.03/shipment basic; Advanced Tracking $0.03 → ~$2-24/mo | Yes | US-centric. JP event detail may be reduced compared to direct scrape. |
| **ShipStation** | Yes (multi-carrier) | Plans from ~$10/mo, but designed for outbound shipping label workflow, not pure tracking. | Yes | Overkill for our use case. |
| **ClickPost** | Yes | Enterprise pricing on request. | Yes | India-focused, not cost-effective for our volume. |
| **DigitalGenius** | Yes | Enterprise. | Yes | CX-focused, expensive. |

**3rd-party recommendation if going that route: ParcelsApp Pro 300 ($19/mo) or Premium 500 ($29/mo).**

But note: even the cheapest 3rd-party costs $108-348/year recurring, vs $0/year for Apps Script scraping at our volume. The premium buys: webhook push (we currently poll on dashboard view anyway), SLA, translation, and protection from HTML changes — none of which are worth $300/year for us right now.

---

## 5. Carrier Status Codes — Translation Table

Source: official Yamato FAQ (faq.kuronekoyamato.co.jp/app/answers/detail/a_id/3887). Vietnamese translations are our own (suggested).

### 5.1 Movement / In Transit

| 日本語 | English (official) | Tiếng Việt (đề xuất) |
|---|---|---|
| 荷物受付 | Shipment Accepted | Đã tiếp nhận hàng |
| 発送 / 発送済み | Shipped Out | Đã xuất kho |
| 輸送中 | In Transit | Đang vận chuyển |
| 作業店通過 | Sorting Center Passed | Đã qua trung tâm phân loại |
| 配達店到着 | Arrived at Delivery Branch | Đã đến chi nhánh giao hàng |
| 配達準備中 | Preparing for Delivery | Đang chuẩn bị giao |
| 配達中 / 持ち出し中 | Out for Delivery | Đang giao đến anh/chị |
| 転送 | Forwarded | Chuyển tiếp đến địa chỉ khác |

### 5.2 Delays / Investigation

| 日本語 | English | Tiếng Việt |
|---|---|---|
| 遅延中 | Delayed | Bị chậm trễ |
| 調査中 | Under Investigation | Đang xác minh |
| 輸送経路修正 | Routing Correction | Đang điều chỉnh tuyến vận chuyển |
| 伝票番号誤り | Tracking Number Error | Sai mã vận đơn |
| 伝票番号未登録 | Tracking Not Registered | Chưa kích hoạt mã vận đơn |

### 5.3 Held / Returned to depot

| 日本語 | English | Tiếng Việt |
|---|---|---|
| 持戻 | Delivery Attempted | Giao không thành, đem về kho |
| 持戻（日時場所変更） | Held — date/place change | Tạm giữ — đổi giờ/địa điểm |
| 持戻（引継中） | Held — driver handover | Tạm giữ — chuyển ca tài xế |
| 持戻（宅配BOX不可） | Held — delivery box unavailable | Tạm giữ — không có tủ giao |
| 一時保管中 | On Hold | Tạm thời lưu kho |
| 配達日・時間帯指定（保管中） | Hold for scheduled delivery | Lưu kho theo lịch hẹn |
| 配達担当店保管中 | Held at delivery branch | Lưu tại chi nhánh giao |
| ご来店予定（保管中） | Hold for pickup at store | Chờ anh/chị đến lấy |
| 保管中（ご指定店） | Held at agent (CVS/PUDO) | Lưu tại điểm đối tác (combini/PUDO) |
| 依頼受付 | Request Received | Đã nhận yêu cầu |

### 5.4 Final state

| 日本語 | English | Tiếng Việt |
|---|---|---|
| 配達完了 | Delivered | Đã giao thành công |
| 投函完了 | Mailbox Drop Complete | Đã bỏ vào hộp thư (Nekopos/DM) |
| 引渡 | Handed Over | Đã bàn giao |
| 委託先引渡 | Handed to Partner Carrier | Bàn giao cho hãng vận chuyển khác |
| 返品 | Returning to Sender | Đang hoàn về người gửi |
| 返品完了 | Return Completed | Đã hoàn thành về người gửi |

For the dashboard timeline, we should map each event to one of these "phase" buckets so customers see a clean progress bar:

```
1. Tiếp nhận    (荷物受付, 発送)
2. Vận chuyển   (輸送中, 作業店通過, 配達店到着)
3. Đang giao    (配達準備中, 配達中)
4. Hoàn tất     (配達完了, 投函完了)
   ─ or ─
   Cần xử lý    (持戻*, 不在, 調査中, 返品)  → highlight RED, surface CTA
```

---

## 6. Implementation Recommendation

### Options compared

| Option | Effort | $/year | Reliability | UX | Maintenance |
|---|---|---|---|---|---|
| **A. Server-side scrape (Apps Script)** | 1-2 days | $0 | MEDIUM (HTML may break) | EXCELLENT (in-app timeline) | LOW-MEDIUM (test parser monthly) |
| **B. 3rd-party API** (ParcelsApp $29/mo) | 1 day | $348 | HIGH | EXCELLENT | LOW |
| **C. Manual entry by admin** | 0.5 day | $0 | HIGH for what's entered, but it's never current | OK on day-of, stale otherwise | HIGH (anh's time) |
| **D. Deep-link only** | 0.5 hr | $0 | N/A — bouncing user out | POOR (Amazon-style timeline impossible in-app) | NONE |

### Recommendation: Hybrid A + D

1. **Build Option A (scrape)** as the primary path. Implement `TrackingProvider` interface so scrape vs API is swappable later.
2. **Cache results in Sheet** for 1 hour per tracking number. At 200-800 orders/month and customers checking ~3-5 times each, that's ~30-50 fetches/day worst case — well within Apps Script `UrlFetchApp` quota (20,000/day for Workspace, 100,000/day for paid).
3. **Always render Option D button** ("Mở trên Yamato →") next to the timeline — this gives customers the official source as proof and serves as the fallback when our parser fails (we display "Tạm thời không tải được — bấm đây để xem trên trang Yamato").
4. **Schedule weekly health check:** Apps Script trigger fetches a known-good tracking number daily and alerts admin if `table.meisai` is missing — early warning if Yamato changes their HTML.
5. **Phase 2 (only if needed):** Migrate to ParcelsApp ($29/mo) if scrape success rate drops below 90%.

### Apps Script implementation sketch

```ts
// providers/yamato.ts
export interface TrackingEvent {
  isLatest: boolean;
  statusJP: string;
  statusVI: string;
  phase: 'accepted' | 'transit' | 'delivering' | 'delivered' | 'attention';
  date: string;       // "2026-04-29"
  time: string;       // "17:23"
  location: string;
  branchCode: string;
}

export interface TrackingProvider {
  fetch(trackingNo: string): Promise<TrackingEvent[]>;
}

// Cache layer — Apps Script CacheService or sheet-based
const CACHE_TTL_SEC = 3600;

export class YamatoScraper implements TrackingProvider {
  async fetch(no: string): Promise<TrackingEvent[]> {
    const cached = readCache(no);
    if (cached && cached.fetchedAt > Date.now() - CACHE_TTL_SEC * 1000) {
      return cached.events;
    }
    const events = scrapeTneko(no);
    writeCache(no, events);
    return events;
  }
}

// /thanh-vien dashboard renders:
// - Timeline (events.map(e => <TimelineRow ...>))
// - Phase progress bar (highest phase reached)
// - "Mở trên Yamato" deep-link button → tneko URL with ?number00=1&number01=<no>
// - Stale-data warning if events empty + retry button
```

---

## 7. Sample Tracking Number Format

**DO NOT use a real one.** Yamato format:

- **12 digits**, displayed as `XXXX-XXXX-XXXX` (4-4-4 hyphenated)
- Example placeholder: `1234-5678-9012`
- Hyphens are cosmetic — the API accepts with or without
- Strip non-digits before sending: `'1234-5678-9012'.replace(/\D/g, '') → '123456789012'`

For Cool TA-Q-BIN (クール宅急便) the format is identical to standard 宅急便 — same 12-digit numbering space.

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Yamato changes `tneko` HTML structure | MEDIUM (no change in 10+ years but no SLA) | HIGH (timeline breaks) | Health-check cron; fallback to deep-link; provider abstraction for quick swap |
| R2 | Yamato deprecates `tneko` in favor of KMS portal | LOW within 12mo, MEDIUM long-term | HIGH | Monitor 410/redirect responses; have ParcelsApp account ready as fallback |
| R3 | IP block from excessive requests | VERY LOW at 200-800/mo with 1hr cache | MEDIUM | Cache aggressively; use Apps Script (rotating Google IPs); throttle ≤1/sec |
| R4 | Shift_JIS mojibake | LOW if encoding declared | MEDIUM (status text garbled) | Always `getContentText('Shift_JIS')`; smoke-test with `持戻` and `投函完了` |
| R5 | Privacy / ToS concern | LOW (we only show the customer their own tracking) | MEDIUM (regulator inquiry) | Don't share/resell data; show only to authenticated `/thanh-vien` user matching the order; log access |
| R6 | Year inference wrong (Yamato shows MM/DD only) | MEDIUM at year boundary | LOW (display off by 1yr) | If event MM/DD > today's MM/DD, assume previous year |
| R7 | Tracking number entered before activation | MEDIUM | LOW | Detect "伝票番号未登録" and show "Yamato chưa kích hoạt mã, anh/chị chờ vài giờ nữa" message |

---

## 9. Sources

- Yamato official FAQ (status meanings, JP): https://faq.kuronekoyamato.co.jp/app/answers/detail/a_id/3887
- Yamato official FAQ (status meanings, EN): https://faq-en.kuronekoyamato.co.jp/app/answers/detail/a_id/3346
- Legacy tracking endpoint: https://toi.kuronekoyamato.co.jp/cgi-bin/tneko
- New KMS portal (login required): https://member.kms.kuronekoyamato.co.jp/parcel/detail
- April 2024 URL change announcement: https://www.ganbare-tencho.com/help/yamatourl.html
- Reference scraping library (`wktk/kuroneko`, MIT-licensed Ruby gem): https://github.com/wktk/kuroneko — selectors `table.saisin`, `table.meisai` confirmed from `lib/kuroneko/parser.rb`
- Qiita technical guide on tneko scraping: https://qiita.com/the_red/items/39eea9ea20f5a81d66e7
- AfterShip Yamato carrier page: https://www.aftership.com/carriers/taqbin-jp
- ParcelsApp pricing: https://parcelsapp.com/pricing-api
- 17TRACK Yamato page: https://www.17track.net/en/carriers/yamato-ヤマト運輸
- TrackingMore Yamato API: https://www.trackingmore.com/taqbin-jp-tracking-api
- EasyPost Yamato: https://www.easypost.com/kuroneko-yamato-tracking
- URL pattern reference: https://noiseandkisses.com/apps/note/en/7179/

---

## 10. Open Questions for Anh Thắng

1. Do anh muốn em ghi tracking number vào Sheet `Orders!Tracking` hiện có, hay tạo tab `Tracking_Cache` riêng?
2. Phase progress bar có cần icon Lottie/animation không, hay chỉ text + dot timeline kiểu Amazon?
3. Trường hợp Yamato Cool fail (unlikely, vì giò chả lạnh) — em có cần auto-trigger email "đơn của anh/chị bị giữ ở kho, em đang liên hệ Yamato" không?
4. Khi nào anh muốn ship feature này? (Em estimate 1.5-2 ngày làm + 0.5 ngày anh test.)
