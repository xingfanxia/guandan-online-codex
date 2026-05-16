# China Network Reality + Deployment Options for Guandan Online

**Date**: 2026-05-16  
**Status**: Pre-launch research — drives the go/no-go decision on Vercel-only deployment for PRC users  
**Stack assumption**: Vercel-hosted frontend + Vercel Functions + Upstash Redis + SSE+POST realtime

---

## 1. Vercel Network Coverage in Mainland China

### POPs in the region

Vercel runs a global Edge Network of 119 POPs in 94 cities across 51 countries. The closest Asia-Pacific POPs to mainland China are:

| POP | Code | Distance to Beijing (approx) |
|-----|------|-------------------------------|
| Hong Kong | `hkg1` | ~2,000 km |
| Singapore | `sin1` | ~4,200 km |
| Tokyo (Haneda) | `hnd1` | ~2,100 km |
| Osaka | `kix1` | ~2,200 km |
| Seoul | `icn1` | ~950 km |

Seoul is geographically closest to Beijing, but cross-border routing through China's international gateways is the real bottleneck — not raw geographic distance.

### Realistic latency from PRC cities to nearest Vercel POP

These are estimates synthesized from WonderNetwork global ping data, Equinix Asia-Pacific latency tables, and Kentik's Cloud Latency Map. They represent the inter-datacenter baseline; actual user-experienced latency through the GFW will be higher.

| From city | To HK `hkg1` | To Tokyo `hnd1` | To Seoul `icn1` |
|-----------|-------------|----------------|-----------------|
| Beijing | 50–70 ms | 60–80 ms | 40–60 ms |
| Shanghai | 30–50 ms | 55–70 ms | 70–90 ms |
| Shenzhen | 15–25 ms | 80–100 ms | 80–100 ms |
| Guangzhou | 20–30 ms | 85–105 ms | 85–105 ms |
| Chengdu | 45–60 ms | 90–110 ms | 90–110 ms |

**Important caveat**: these numbers are measured on clean inter-datacenter links. User traffic from mainland China traverses China Telecom / China Unicom / China Mobile international gateways, adding 30–80 ms of unpredictable overhead and occasional deep packet inspection (DPI) stalls. Round-trip latency for a user in Beijing accessing `hkg1` through the GFW is realistically **80–180 ms** under normal conditions.

### Vercel domain reachability without VPN

Vercel's own knowledge base (vercel.com/kb) states explicitly:

> "Vercel cannot guarantee availability or performance within mainland China, and any site hosted outside of China may face latency, throttling, or inaccessibility due to factors outside Vercel's control."

The `*.vercel.app` subdomain is confirmed to suffer **DNS pollution in mainland China** — GitHub Vercel community discussion #803 documents that `vercel.app` is affected by SNI-based blocking and DNS spoofing that returns polluted (blocked) IPs. Custom domains on Vercel are less susceptible because they don't share the `vercel.app` namespace, but Vercel's underlying edge IP ranges can still be throttled.

**Summary**: `*.vercel.app` is unreliable-to-broken for PRC users without a VPN. A custom domain reduces friction but does not guarantee access or good performance.

### GFW consistency

China's cross-border internet is structurally inconsistent. The GFW's behavior depends on ISP (CT/CU/CM all route differently), province, time of day, and political climate. For gaming — where a 500 ms stall kills a hand — this inconsistency is as damaging as raw latency.

The August 20, 2025 incident ([gfw.report](https://gfw.report/blog/gfw_unconditional_rst_20250820/en/)) demonstrated the GFW's capability to unconditionally inject TCP RST+ACK packets on port 443 for 74 minutes, cutting China off from all HTTPS traffic globally. While this appears to have been a configuration error or test, it is a real risk category: a transient 74-minute HTTPS blackout is an extinction event for active game sessions.

---

## 2. Upstash Redis from Mainland China

### Available regions

Upstash Redis runs on AWS infrastructure. The relevant Asia-Pacific regions:

| Region | Upstash code | Nearest PRC city | Network path |
|--------|-------------|-----------------|--------------|
| Singapore | `ap-southeast-1` | Shenzhen / Guangzhou | Cross-border via Hong Kong / Singapore peering |
| Tokyo | `ap-northeast-1` | Beijing / Shanghai | Cross-border via Japan peering |

Upstash's Global replication feature distributes data across up to 8 regions (US-East, US-West, Frankfurt, Singapore, São Paulo, Ireland, California, Australia). Reads are served from the closest replica; writes go to the primary.

### Latency from PRC to Upstash regions

Upstash's own benchmarks show sub-millisecond latency for reads within the same AWS region, and 5 ms average globally with edge caching enabled. Those numbers assume direct internet, not a cross-GFW path.

Realistic estimates for PRC → Upstash (HTTP/REST over the GFW):

- **PRC → Singapore (`ap-southeast-1`)**: 80–180 ms RTT (cross-border through Guangzhou international gateway or Hong Kong)
- **PRC → Tokyo (`ap-northeast-1`)**: 80–160 ms RTT (cross-border via Jiangsu/Shanghai international gateway)

**Upstash and China specifically**: 21cloudbox's support page ([21cloudbox.com/support/upstash-china.html](https://www.21cloudbox.com/support/upstash-china.html)) documents that Upstash faces the same AWS-in-China restrictions. There is no Upstash region inside mainland China. For our SSE pub/sub shape (the server-side function calls Upstash to read game state and push moves), every server-side Upstash read adds ~100–150 ms behind the GFW before the response reaches the client. This compounds with function cold-start and client RTT.

### Multi-region vs single-region for our workload

Our realtime shape is: `POST /move` → Vercel Function → read/write Upstash → respond with move result + SSE push. This is a write-heavy workload (every card play is a write). Global replication helps reads (standings, game state snapshots) but writes always route to the primary. If the primary is in Singapore and our Vercel Function runs from `hkg1`, the function-to-Upstash hop is ~50–80 ms within-AWS, which is fine. The outer client-to-Vercel RTT is where GFW pain shows up.

**Recommendation**: Use Upstash `ap-southeast-1` (Singapore) as primary, no global replication needed for v1 — it does not reduce the client-side latency problem and adds cost (~$10–20/month for global vs. ~$0 on Free / $10 on Pay-As-You-Go for single region).

---

## 3. GFW Behavior with Our Specific Stack

### HTTP/HTTPS (port 443) — base risk

Standard HTTPS to a custom domain hosted on Vercel is generally reachable from PRC under normal conditions. The GFW inspects SNI (the hostname in the TLS ClientHello) and uses DNS poisoning and IP blocking to control access. Custom domains that haven't been specifically targeted are usually accessible, but with elevated latency (30–80 ms overhead at the international gateway) and occasional packet loss.

The August 2025 incident showed port 443 is not sacrosanct — the GFW can blanket-RST all port-443 connections. This is a tail risk, not a baseline condition, but it exists.

### WebSocket — we avoid this, but worth documenting

WebSocket connections are frequently blocked or reset by stateful firewalls in China, particularly on non-standard ports. Our stack uses SSE+POST and deliberately avoids WebSockets. This is the right call for China reachability.

### SSE long-lived connections — the main risk for our stack

Server-Sent Events use a persistent HTTP/1.1 or HTTP/2 response stream. This is where our stack is most vulnerable to GFW interference:

1. **Stateful firewall timeouts**: China's international gateways have stateful TCP inspection. Long-lived idle-ish connections (SSE streams that carry infrequent pushes) can be reset when the firewall's flow table entry times out. Typical GFW flow-table idle timeouts are reported in the 60–120 second range. A game hand that takes 2 minutes without a card being played could see the SSE stream reset.

2. **DPI on response body**: The GFW does not just inspect the initial connection — it can inspect data packets. SSE data frames (prefixed `data: ...`) are plaintext-over-TLS, so the GFW sees encrypted content only. This is not a current risk, but the GFW's capabilities expand.

3. **Mitigation**: Send a keepalive comment (`:\n\n`) on the SSE stream every 20–30 seconds. This keeps the flow-table entry alive and prevents intermediate proxy/firewall idle resets. Most SSE server implementations support this natively.

### Long-polling fallback

If SSE proves unreliable for PRC users, long-polling (client sends `POST /poll`, server holds for up to 20s, responds with event or empty, client immediately re-polls) is a viable fallback. It degrades gracefully and works through nearly all proxy configurations. The latency floor is higher (~200–400 ms for a move notification vs. <100 ms for SSE push), but it is far more resilient to stateful firewall timeouts.

Long-polling should be implemented as an automatic fallback when the SSE connection drops more than twice within a 60-second window.

### TLS 1.3 ECH (Encrypted Client Hello)

ECH is relevant because it hides the SNI (hostname) inside the encrypted TLS handshake, defeating SNI-based blocking. Vercel deploys TLS 1.3 via its edge network (Cloudflare infrastructure powers parts of Vercel's CDN). The GFW's current ECH posture (per gfw.report publications through 2025):

- **ESNI** (ECH's predecessor) was blocked starting 2020.
- **ECH proper** is effectively blocked in China because the GFW blocks encrypted DNS (DoH / DoT), which is required to retrieve the ECH config from DNS records. Without encrypted DNS, the browser falls back to unencrypted DNS → plaintext SNI → GFW can inspect and filter.
- The GFW does not block QUIC payloads containing ECH unless the outer SNI is to a blocked domain, but this is QUIC-specific and not relevant to our standard HTTPS stack.

**Practical conclusion**: ECH does not help PRC users reach Vercel-hosted services in 2025/2026. It's blocked at the DNS layer before ECH can take effect. Do not rely on ECH as a GFW circumvention strategy.

---

## 4. Domain Access in PRC

### `*.vercel.app` — broken

DNS pollution confirmed (GitHub vercel/community discussion #803). Treat `*.vercel.app` as unreachable for PRC users without a VPN. If we launch with only a `*.vercel.app` URL, we have effectively zero guaranteed PRC reach.

### Custom domain on Vercel — better but not guaranteed

Pointing a custom domain (e.g., `guandan.game` or `gd.ax0x.ai`) at Vercel's edge network improves the situation because:
- The domain name isn't in any pre-existing GFW blocklist
- DNS resolution goes to Vercel's Anycast IPs rather than the poisoned `vercel.app` IPs

However, the underlying Vercel edge IPs are still foreign infrastructure. Latency is still 80–180 ms p50 for PRC users, and the GFW can still throttle or block at the IP level if it chooses.

### ICP filing requirements

China's January 2025 rules require ICP filing for all websites, apps, and mini-programs operating in China if the domain resolves to servers inside mainland China. The requirement is triggered by **mainland China hosting**, not mainland China users:

- Domain resolves to mainland China server → ICP filing required
- Domain resolves to servers outside mainland China → ICP filing not required (but PSB filing may be required for certain content categories)

Since Vercel has no mainland China infrastructure, ICP filing is **not legally required** for a Vercel-hosted app. Users in China access it as foreign internet content.

**The practical problem**: ICP filing requires a PRC business entity (legal person registered in China). Foreign individuals cannot obtain an ICP filing. For a personal project, ICP is a non-starter. This means we can never host on mainland China infrastructure with proper compliance.

### Cloudflare China Network — costs too much

Cloudflare's China Network product runs POPs inside mainland China via its JD Cloud partnership, covering 30+ cities. It **requires a valid ICP filing or license** for each apex domain. Same blocker as above — no ICP means no Cloudflare China Network. Additionally, pricing is enterprise-tier (not published publicly; requires Cloudflare sales engagement).

---

## 5. Alternative / Supplementary Deployment Paths

### A. Tencent CloudBase (TCB) + Tencent CDN

**What it is**: Tencent's BaaS/serverless platform with native China-region compute, database, and CDN. Supports Cloud Functions (Node.js, Python, Go, Java), real-time database push, and Tencent CDN acceleration.

**Pros**:
- Genuine PRC-native latency: function → user RTT as low as 5–20 ms
- No cross-border gateway — traffic stays inside China's domestic network
- Real-time database supports SSE-equivalent push semantics
- Serverless pay-per-invocation; near-zero cost at low traffic

**Cons**:
- You effectively have to maintain two separate backends (Vercel for non-PRC, TCB for PRC)
- CloudBase's API surface differs from Vercel Functions — requires porting all API routes
- Chinese-only developer console; documentation quality mixed in English
- Requires a Tencent Cloud account; payments via Chinese banking infrastructure (complicates billing for overseas developers)
- No Upstash equivalent inside China — would need Tencent's TencentDB for Redis (~$10–30/month for the smallest instance)

**Cost**: CloudBase free tier covers ~1M function invocations and 1 GB traffic/month, which covers v1 comfortably. Paid plans start at ~¥19/month (~$2.60).

**Complexity**: High — dual backend with session affinity routing (geo-detect user → proxy to correct backend).

### B. Aliyun Function Compute + Aliyun CDN

**What it is**: Alibaba Cloud's serverless compute (Node.js/Python/Go/Java) + Alibaba Cloud CDN with PRC-native POPs.

**Pros**:
- Same PRC-native latency benefits as TCB
- More mature serverless product than TCB; better English documentation
- Aliyun CDN is one of the top 2 CDNs for China (alongside Tencent CDN)

**Cons**:
- Same dual-backend complexity as TCB
- Function Compute's cold-start latency is reported as 200–500 ms (vs. ~50 ms for Vercel on warm)
- Aliyun billing in CNY; overseas credit card support available but cumbersome
- No equivalent to Upstash — need ApsaraDB for Redis (~$25–50/month minimum for the smallest PRC-region instance)

**Cost**: Free tier covers 1M invocations + 400K CU-seconds/month. A minimal ApsaraDB Redis instance is the cost floor (~$25/month).

**Complexity**: High.

### C. Cloudflare Workers + China routing via custom origin

Using Cloudflare Workers as a proxy layer (custom domain → CF Worker → Vercel origin) partially helps because Cloudflare's non-China network does have good Hong Kong and Singapore POPs that are well-peered with PRC networks. However:

- Cloudflare's China Network (in-country POPs) requires ICP — same blocker as before
- Cloudflare's non-China POPs via HK/Singapore give ~80–150 ms RTT to PRC, similar to Vercel direct
- Cloudflare Workers can be configured to try multiple origins and do health checks, but they don't solve the cross-border latency ceiling

**Cost**: $0 (free tier) to $5/month (Workers Paid). Minimal complexity.

**Net verdict**: Marginal improvement for static assets; no meaningful help for SSE latency.

### D. Hybrid: Vercel frontend + Tencent Cloud SSE server for PRC users

Route PRC users (by geo-IP detection at the Vercel Edge Middleware layer) to a separate SSE+POST server running on Tencent Cloud Run or Cloud Functions in a Shenzhen/Guangzhou region. Upstash (Singapore) is shared for game state — TCB functions can reach Upstash Singapore in ~80–120 ms, which is acceptable for write-path latency.

**Pros**:
- PRC users get sub-100 ms move latency (domestic network to Tencent + Upstash write in background)
- Non-PRC users stay on Vercel (zero change to their path)
- Shared Upstash keeps game state consistent across both backends

**Cons**:
- Significant complexity: two compute backends, geo-routing middleware, session management across regions
- Cross-region game rooms (PRC player + overseas player in same room) need careful routing — both players should connect to the same backend; the PRC-native backend can't serve the overseas player well and vice versa
- Operational overhead: two deployments, two billing accounts, two log streams

**Cost**: ~$5–15/month for Tencent Cloud Run at low traffic + existing Vercel.

### E. Accept Vercel latency for v1

Deploy on Vercel only. Accept that PRC users face 150–300 ms p95 RTT. Measure actual impact. If user feedback or telemetry shows the experience is playable, defer PRC optimization.

**Argument for**: Guandan is a turn-based card game, not a reaction-time shooter. 200 ms latency on a card play is annoying but not unplayable. A player takes 2–30 seconds to decide a move; 200 ms of network latency is typically not the bottleneck.

**Cost**: $0 additional (existing Vercel plan).

**Complexity**: Zero.

---

## 6. Recommendation Matrix

For a personal project budget of $10–30/month, ranked by practicality:

| Option | PRC p95 latency | Monthly cost | Complexity | Viable for v1? |
|--------|----------------|-------------|------------|----------------|
| **A: Vercel-only, accept latency** | 200–500 ms | ~$0 additional | None | Yes — start here |
| **B: CF Workers proxy (non-China POPs)** | 150–350 ms | $0–5 | Low | Marginal improvement, try if A fails |
| **C: Vercel + TCB mirror (deferred)** | 20–80 ms (PRC) | $5–15 | High | Defer to v2 if PRC user count justifies |
| **D: Move to Aliyun/TCB stack entirely** | 20–80 ms (PRC) | $25–50 | Very high | Not for personal project |
| **E: Cloudflare China Network** | 10–30 ms | Enterprise ($$$) | Requires ICP | Blocked by ICP requirement |

**Recommendation**: Launch on Option A (Vercel-only). The game's turn-based nature makes 200 ms latency survivable. Instrument move RTT from day one with a client-side timing beacon (send timestamp in the POST body, compare to response timestamp). If PRC users report p95 > 400 ms consistently, escalate to Option C (TCB mirror for PRC).

---

## 7. Specific Testing Plan

### Goal

Measure actual SSE first-byte latency and POST round-trip from PRC before committing to or rejecting the Vercel-only path.

### Step 1: Deploy a minimal echo server to Vercel

Create a Vercel project with two endpoints:
- `GET /sse-echo`: holds the connection, sends a `data: ping\n\n` frame every 5 seconds for 60 seconds, then closes
- `POST /echo`: reads the request body (containing client-side `Date.now()` timestamp), responds with `{ received: <timestamp>, serverNow: <timestamp> }` immediately

Deploy to a custom domain (not `*.vercel.app`) to avoid the DNS pollution issue.

### Step 2: Procure a PRC-located testing endpoint

Options (all ~$5–15/month, pay-as-you-go):
- **Alibaba Cloud ECS instance** in Hangzhou or Shenzhen (CN regions available with overseas credit card)
- **Tencent Cloud CVM** in Guangzhou or Shanghai
- **Vultr or DigitalOcean VPS** in Hong Kong (not mainland, but useful for comparison baseline)

Alternatively, use a friend or contact with mainland China internet access and a laptop.

### Step 3: Run measurement scripts

From the PRC VPS, run 30-second continuous measurement:

```bash
# HTTP POST RTT (measures move-path latency)
for i in $(seq 1 60); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -X POST https://your-domain.com/echo \
    -H "Content-Type: application/json" \
    -d "{\"t\": $(date +%s%3N)}"
  sleep 0.5
done

# SSE first-byte time
curl -s -N --max-time 30 \
  -w "first_byte: %{time_starttransfer}s\n" \
  https://your-domain.com/sse-echo > /tmp/sse-output.txt &
```

Collect p50/p95/p99 from the output.

### Step 4: Test from multiple ISPs and cities

The same URL can behave very differently on China Telecom (CT), China Unicom (CU), and China Mobile (CM). If possible, test on at least CT and CU, as these have different international peering arrangements with HK/Tokyo/Singapore.

### Vendor synthetic monitoring tools

- **Alibaba Cloud CloudMonitor**: supports HTTP availability monitoring from PRC probes; configure a URL check on 5-minute intervals from Beijing/Shanghai/Shenzhen probes. Free up to a threshold.
- **CDNetworks or Boce.io**: PRC-focused synthetic monitoring tools; provide latency data from 30+ PRC cities. Useful for broad coverage without procuring per-city VPS.

### Acceptance threshold

| Metric | Pass | Investigate | Fail |
|--------|------|-------------|------|
| POST RTT p50 (PRC) | ≤200 ms | 200–350 ms | >350 ms |
| POST RTT p95 (PRC) | ≤350 ms | 350–500 ms | >500 ms |
| SSE first-byte (PRC) | ≤500 ms | 500–1000 ms | >1000 ms |
| SSE stream resets per 10-min session | 0–1 | 2–3 | >3 |

---

## 8. What to Do If Test Results Are Bad

If PRC p95 POST latency exceeds 400 ms or SSE streams reset more than 2× per session:

### Option 8a: Move SSE+POST server to Tencent Cloud Run (Shenzhen)

Tencent Cloud Run supports stateless containerized workloads with autoscaling to zero. Deploy the same Node.js SSE+POST server to a Shenzhen or Guangzhou region. Estimated user-facing RTT from PRC users: 20–80 ms (domestic network only, no cross-border gateway).

Game state (Upstash Redis in Singapore) is still accessed cross-border from the TCB function, adding ~80–120 ms to each move write — but this is a background operation from the server's perspective, and the server can respond to the client immediately with an optimistic move acknowledgment before Upstash confirms.

### Option 8b: Hybrid geo-routing at Vercel Edge Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const country = req.geo?.country;
  if (country === 'CN') {
    // Rewrite /api/game/* to PRC-region backend
    const url = req.nextUrl.clone();
    url.host = 'prc-backend.your-domain.com';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
```

Non-PRC traffic continues to Vercel Functions. PRC traffic is rewritten to the TCB/Aliyun backend URL. Both backends read/write the same Upstash Redis instance for shared game state.

**Cross-region room handling**: When a room contains both PRC and non-PRC players, all players in that room should be routed to the same backend (to avoid SSE fan-out complexity). Pragmatically, route all players in a room to the origin the room host connected to, stored in the room's Upstash record.

### Option 8c: Long-polling automatic fallback

If SSE stream resets are the primary failure mode (vs. raw latency), implement client-side auto-fallback:

```typescript
class GameTransport {
  private sseFailures = 0;
  private usePolling = false;

  connect(roomCode: string) {
    if (this.usePolling || this.sseFailures >= 2) {
      this.startLongPolling(roomCode);
    } else {
      this.startSSE(roomCode);
    }
  }

  private onSSEError() {
    this.sseFailures++;
    if (this.sseFailures >= 2) {
      this.usePolling = true;
      this.startLongPolling(this.currentRoomCode);
    }
  }
}
```

Long-polling adds 200–400 ms per event (one RTT to receive the poll response + one RTT for the next poll), but it works through nearly every proxy and stateful firewall configuration. For a turn-based game where player decisions take seconds, this is acceptable.

---

## 9. Concrete Action Items for v1

### Phase 1 (before launch): Validate the assumption

1. Deploy a Vercel-hosted echo server to a custom domain.
2. Procure a 1-month Alibaba Cloud ECS instance in Hangzhou or Shenzhen (CN Domestic region, ~$5–10).
3. Run the measurement scripts from Section 7.
4. Instrument the game client to log `move_rtt_ms = responseTimestamp - sendTimestamp` and report it as a custom metric (can be a simple POST to `/api/telemetry` on each move).
5. **Decision gate**: If PRC p95 POST RTT < 350 ms → proceed with Vercel-only. If > 350 ms → plan Option 8a.

### Phase 2 (if PRC p95 > 350 ms): PRC mirror

1. Create a Tencent Cloud account (requires a phone number; overseas phone numbers work for international.cloud.tencent.com).
2. Deploy the SSE+POST server (same codebase, containerized) to Cloud Run in Guangzhou.
3. Point the Upstash primary to Singapore (`ap-southeast-1`); this is the closest Upstash region to both the Vercel and TCB compute.
4. Add geo-routing middleware to Vercel (Section 8b).
5. Test with a cross-border room (one PRC player, one overseas player) to validate session continuity.

### Phase 3 (if player count grows): Session continuity hardening

1. Store each room's "preferred backend" (Vercel vs. TCB) in the Upstash room record.
2. On join, a new player gets the room's preferred backend URL; geo-routing middleware for new rooms uses the host player's location.
3. Monitor Upstash write latency from TCB (Singapore round-trip) — if it becomes a problem, evaluate Tencent's TencentDB for Redis (PRC-region) as a second Redis store with periodic sync to Upstash for cross-region state.

---

## Unknowns and Gaps

The following items cannot be verified without actual PRC infrastructure access or real user data:

1. **Actual Vercel edge IP throttling**: Whether China Telecom / Unicom / Mobile currently rate-limit or throttle Vercel's edge IPs (HK/Tokyo-sourced) is unknown. It changes over time. The August 2025 port-443 incident suggests the GFW has more aggressive capabilities than previously assumed.

2. **SSE reset frequency under GFW**: No controlled measurement of how often the GFW resets SSE streams on a sustained game session is publicly documented. The 60–120 second idle timeout estimate is inferred from stateful firewall behavior generally, not from Vercel-specific measurements.

3. **Tencent CloudBase cold-start for SSE**: TCB/Cloud Functions cold-start is documented to be 200–500 ms. For SSE connections, a cold-start on reconnect would be user-visible. Whether TCB's minimum instance count can be set to 1 (warm always) at low cost is not verified.

4. **Upstash Singapore → TCB Shenzhen latency**: Estimated at 80–120 ms based on AWS Singapore → Shenzhen cross-border routing. Actual measurement needed.

5. **GFW behavioral changes**: The GFW's capabilities and targeting change without public notice. This document reflects the 2025–2026 state; re-evaluate before any significant PRC user growth event.

---

## Sources

- [Vercel: Accessing Vercel-hosted sites from mainland China](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)
- [Vercel: Global network and regions](https://vercel.com/docs/regions)
- [Vercel Community: `vercel.app` Blocked by SNI and DNS Pollution in China (Discussion #803)](https://github.com/vercel/community/discussions/803)
- [Vercel Community: Configure domains with Alibaba CDN for China Mainland](https://community.vercel.com/t/how-to-configure-vercel-domains-with-alibaba-cdn-for-china-mainland/36072)
- [21cloudbox: How to Improve the Access Speed of Vercel in China](https://www.21cloudbox.com/solutions/how-to-speed-up-vercel-in-china.html)
- [21cloudbox: Understanding Upstash and Its Challenges in China](https://www.21cloudbox.com/support/upstash-china.html)
- [Upstash: Global Replication Documentation](https://upstash.com/docs/common/concepts/global-replication)
- [Upstash: Fast Anywhere with Global 2.0](https://upstash.com/blog/global-2)
- [Upstash: 5ms Global Redis Latency with Edge Caching](https://upstash.com/blog/edge-caching-benchmark)
- [GFW Report: Analysis of the GFW's Unconditional Port 443 Block on August 20, 2025](https://gfw.report/blog/gfw_unconditional_rst_20250820/en/)
- [GFW Report: Exposing and Circumventing China's Censorship of ESNI](https://gfw.report/blog/gfw_esni_blocking/en/)
- [GFW Report: How the GFW Detects and Blocks Fully Encrypted Traffic (USENIX Security 2023)](https://gfw.report/publications/usenixsecurity23/en/)
- [GFW Report: Exposing and Circumventing SNI-based QUIC Censorship (USENIX Security 2025)](https://gfw.report/publications/usenixsecurity25/en/)
- [Chinafy: A 2025 Guide to ICP Licences in China](https://www.chinafy.com/blog/a-2025-guide-to-icp-licences-in-china-do-i-need-an-icp-license-for-my-website/)
- [Cloudflare: China Network Documentation](https://developers.cloudflare.com/china-network/)
- [Cloudflare: ICP Requirements for China Network](https://developers.cloudflare.com/china-network/concepts/icp/)
- [WonderNetwork: Ping time from Hong Kong](https://wondernetwork.com/pings/Hong%20Kong)
- [Kentik Cloud Latency Map](https://clm.kentik.com/)
- [The Register: China cut itself off from the global internet on August 20, 2025](https://www.theregister.com/2025/08/21/china_port_443_block_outage/)
- [Tencent Cloud: CloudBase product page](https://www.tencentcloud.com/products/tcb)
- [Alibaba Cloud: Function Compute product page](https://www.alibabacloud.com/en/product/function-compute)
- [CloudInsight: Tencent Cloud vs Alibaba Cloud 2025 Comparison](https://cloudinsight.cc/en/blog/tencent-vs-alibaba-cloud-comparison)
- [Lantern Digital: Does Vercel Work in China?](https://lantern.digital/insights/does-vercel-work-in-china)
- [ECH in Censorship Circumvention (PETS Symposium 2025)](https://www.petsymposium.org/foci/2025/foci-2025-0016.pdf)
