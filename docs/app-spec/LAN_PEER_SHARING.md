# LAN Peer Sharing — "Family View"

## Problem

A user scores their DNA on their desktop browser. Results are "trapped" in that
browser's IndexedDB. They want to casually browse results on their phone (or a
family member wants to view on their device) without re-uploading and re-scoring.

## Solution

The source device generates a QR code containing a WebRTC offer. The viewer
scans it, generates a compressed answer displayed as a short word-code, and
the source user types that code. Peer-to-peer DataChannel opens — all data
stays on the local network. **Zero servers involved.**

---

## User Flow

### Step 1: Source enables sharing (Desktop)

Settings → **"📡 Share Results"** section → "Start Sharing" button

The browser:

1. Creates a WebRTC peer connection with local ICE candidates
2. Generates an SDP offer
3. Encodes offer as a QR code displayed on screen
4. Also shows the offer as a copyable link (fallback)

UI shows:

```
┌─────────────────────────────┐
│   Scan with another device  │
│                             │
│        ┌─────────┐          │
│        │ QR CODE │          │
│        └─────────┘          │
│                             │
│   Or copy link: [📋 Copy]   │
│                             │
│   Waiting for code...       │
│   ┌─┐ ┌─┐ ┌─┐ ┌─┐         │
│   └─┘ └─┘ └─┘ └─┘         │
│                             │
│   [Cancel]                  │
└─────────────────────────────┘
```

### Step 2: Viewer scans QR (Phone)

Phone camera scans QR → opens URL like:

```
https://app.asili.dev/pair/<compressed-base64>
```

The app:

1. Detects the `?offer=` param
2. Decodes the SDP offer
3. Creates a peer connection, sets remote description
4. Generates an SDP answer
5. Compresses the answer into a **4-word code** (see encoding below)
6. Displays the code prominently

UI shows:

```
┌─────────────────────────────┐
│                             │
│   Your connection code:     │
│                             │
│   🐸 FROG  🏮 LAMP         │
│   🎲 DICE  🌊 WAVE         │
│                             │
│   Enter this on the other   │
│   device to connect.        │
│                             │
│   [Waiting for connection…] │
└─────────────────────────────┘
```

### Step 3: Source enters code (Desktop)

User types the 4 words (or picks emoji) into the waiting input.

The source:

1. Decodes the word-code back into the SDP answer
2. Sets remote description
3. ICE candidates connect (both on same LAN → direct connection)
4. DataChannel opens → **paired!**

### Step 4: Viewing

Viewer sees source's trait grid in read-only mode. Data streams on-demand
over the DataChannel as the viewer navigates.

---

## Answer Compression (SDP → 4 words)

The full SDP answer is ~2KB, but for the "answer" side on a LAN connection
we only need:

- ICE ufrag (4 bytes)
- ICE password (22 bytes)  
- DTLS fingerprint (32 bytes)
- A candidate or two (IP:port, ~6 bytes each on LAN)

**~70 bytes of essential data.** Encoded with a 2048-word dictionary:

- 2048 words = 11 bits per word
- 4 words = 44 bits = not enough

Actually let's be more careful. Minimum viable answer payload:

- ICE ufrag: 4 chars (24 bits)
- ICE pwd: 22 chars (132 bits)  
- Fingerprint: 32 bytes (256 bits)
- 1 LAN candidate IP:port (48 bits)
- Total: ~460 bits → ~42 bytes

With a 4096-word list (12 bits/word): 460 / 12 = **39 words**. Too many.

### Revised approach: Shared-secret derivation

Instead of encoding the full answer, use a **PAKE-style key exchange**:

1. Source generates a random 4-word code (44 bits of entropy from 2048-word list)
2. Source embeds a hash of this code in the QR/offer URL
3. Viewer decodes the offer, sees the hash, generates its answer
4. Viewer encrypts the answer with the 4-word code and stores it in
   the WebRTC DataChannel negotiation (or more practically...)

**Actually, simplest approach:**

### Revised approach: Offer contains everything, answer is minimal

Since both devices are on the same LAN:

1. The **offer** QR contains the source's full SDP + local IP candidates
2. The viewer connects directly to the source's ICE candidates
3. The "answer" the viewer needs to send back is just the DTLS fingerprint
   for mutual authentication

DTLS fingerprint = 32 bytes = 256 bits.  
With a 2048-word list: 256 / 11 = **24 words**. Still too many.

### Final approach: Relay answer through the offer's DataChannel

Wait — actually the cleanest approach:

1. Source creates offer with all local ICE candidates baked in
2. QR contains the offer
3. Viewer creates answer, but instead of encoding it into words...
4. **The viewer attempts ICE connectivity directly** — on a LAN, the
   viewer already knows the source's IP:port from the offer candidates
5. The viewer opens a **temporary HTTP endpoint?** — no, browsers can't.

### ACTUAL final approach: Two QR codes

Simplest, most honest implementation:

```
SOURCE                              VIEWER
──────                              ──────
1. Show QR (offer)
                                    2. Scan → decode offer
                                       Generate answer
                                       Show QR (answer)
3. Scan viewer's QR (via webcam)
   OR viewer shows short URL that
   source opens in new tab on same machine
   → Decode answer
   → Connect!
```

For the "scan back" step, options by usability:

**Option A: Webcam scan (best UX if user has webcam)**
Desktop activates camera, points at phone screen, reads QR.

**Option B: Manual code (universal fallback)**
The answer IS too long for 4 words, but we can use a **6-digit PIN** as a
session ID + a local HTTP trick:

Actually, let me reconsider. The real problem is getting ~2KB from phone → desktop
without a server. The user's options in practice:

1. **Show QR on phone → desktop webcam scans it** (needs camera permission)
2. **Phone copies link → user pastes into desktop** (airdrop/messages/email to self)
3. **Phone shows numeric code → desktop types it** (only works if code is short)

For #3 to work, we need the code to be SHORT, which means we need a rendezvous.

### THE ACTUAL SOLUTION: Use the offer URL as a rendezvous

Here's the trick that makes this work with one QR + one short code:

1. Source generates a **random 6-digit room code** (e.g. `847293`)
2. Source creates WebRTC offer
3. Source starts **polling its own open tab** via BroadcastChannel for the answer
4. QR encodes: `https://app.asili.dev/beta?pair=847293`
5. Viewer opens URL, sees "Enter the code shown on the other device"

Wait no, BroadcastChannel is same-device only...

---

## ✅ FINAL DESIGN: QR + Webcam/Paste

After working through all the constraints, the cleanest zero-server flow:

### Primary: QR → QR (webcam)

```
SOURCE (desktop)                    VIEWER (phone)
1. Click "Share" →
   Generate offer →
   Show QR on screen
                                    2. Scan QR with phone camera
                                       → Decode offer
                                       → Generate answer
                                       → Show answer as QR on phone

3. Click "Scan response" →
   Desktop webcam activates →
   Point at phone QR →
   Decode answer →
   Connected! ✅
```

### Fallback: QR → Paste

```
SOURCE (desktop)                    VIEWER (phone)
1. Click "Share" →
   Show QR on screen
                                    2. Scan QR with phone camera
                                       → Generate answer
                                       → Show "Copy Code" button
                                       (copies encoded answer to clipboard)

3. User sends code to desktop
   (paste in browser, iMessage, etc.)
   Source has "Paste response" input →
   Decode → Connected! ✅
```

### The encoded answer

The answer blob (~2KB of SDP) gets:

1. Stripped to essential fields only (ufrag, pwd, fingerprint, candidates)
2. Binary packed (~80 bytes)
3. Base64url encoded (~107 chars)

**107 characters** is copyable/pasteable. Not pretty, but functional.
Displayed on the phone as a monospace block with a big "Copy" button.

---

## Architecture

```
┌──────────────────────┐              ┌──────────────────────┐
│  SOURCE (Desktop)    │              │  VIEWER (Phone)      │
│                      │   WebRTC     │                      │
│  IndexedDB ─────────────DataChannel──── Read-only UI      │
│                      │   (direct)   │                      │
│  1. Show QR (offer)  │              │  2. Scan QR          │
│  3. Scan/paste answer│              │     Show answer QR   │
│                      │              │                      │
└──────────────────────┘              └──────────────────────┘

         No server. No relay. No cloud. Direct LAN connection.
```

### Data Protocol (over DataChannel)

Once connected, viewer requests data as needed:

```js
// Viewer sends:
{ type: "get-individuals" }
{ type: "get-results", individualId: "..." }
{ type: "get-trait-detail", individualId: "...", traitId: "..." }

// Source responds:
{ type: "individuals", data: [...] }
{ type: "results", data: [...] }
{ type: "trait-detail", data: {...} }
```

---

## SDP Compression

Full SDP offer/answer is ~2-4KB of text. For QR codes, we compress:

### Offer (source → QR)

QR codes can hold ~4KB in binary mode. A full SDP offer fits, but barely.
Better to extract only what's needed:

```js
// Minimal offer payload (~200 bytes binary)
{
  ufrag: "a1b2",          // 4 bytes
  pwd: "aGVsbG8gd29ybGQ...", // 22 bytes
  fingerprint: Uint8Array(32),
  candidates: [
    { ip: "192.168.1.42", port: 54321 }, // ~6 bytes each
    { ip: "192.168.1.42", port: 54322 },
  ],
  // Enough to reconstruct a valid SDP
}
```

Compressed + base64: ~300 chars → clean QR code.

### Answer (viewer → QR or paste)

Same structure, typically 1 candidate (phone's LAN IP):
~150 bytes binary → ~200 chars base64 → small QR or pasteable string.

---

## Component Structure

```
src/
├── components/molecules/
│   ├── share-source/
│   │   └── share-source.js      # QR display + webcam scanner + paste input
│   ├── share-viewer/
│   │   └── share-viewer.js      # Answer QR display + "copy code" button
│   └── viewer-bar/
│       └── viewer-bar.js        # "Viewing X's results" persistent banner
├── utils/
│   ├── peer-rtc.js              # WebRTC offer/answer/DataChannel
│   ├── peer-protocol.js         # Request/response over DataChannel
│   ├── peer-sdp.js              # SDP compression/decompression
│   └── peer-qr.js              # QR encode/decode (uses existing lib or canvas)
```

---

## Settings Drawer Integration

New section in Settings:

```
┌─────────────────────────────────────┐
│ 📡 Share Results                     │
│                                     │
│ Let another device on your network  │
│ view your scored results.           │
│                                     │
│ [Start Sharing]                     │
│                                     │
│ • No data leaves your network       │
│ • Connection is direct, device      │
│   to device                         │
│ • Closes when you close this tab    │
└─────────────────────────────────────┘
```

When sharing is active:

```
┌─────────────────────────────────────┐
│ 📡 Share Results                     │
│                                     │
│ 🟢 Sharing active                   │
│ 👀 1 device connected               │
│                                     │
│ [Stop Sharing]                      │
└─────────────────────────────────────┘
```

---

## Viewer Mode

When a device connects as a viewer, the app enters **read-only mode**:

- Upload zone hidden
- Scoring controls hidden
- Settings shows "Connected to [Source]" instead of share controls
- Persistent banner at top: "📡 Viewing results from Desktop Chrome"
- Individual switcher shows source's individuals
- Trait grid populated via DataChannel requests (lazy-loaded)
- Disconnect button in banner

---

## Screen Timeout / Keep-Alive

Source device must stay awake while sharing:

- Extend existing `wake-lock.js` to activate during active sharing session
- If connection drops (screen locked briefly), auto-reconnect via ICE restart
- UI tip: "💡 Keep this browser tab open to share results"

---

## Security

| Property | How |
|---|---|
| Physical proximity required | Must scan QR from the device's screen |
| No cloud involvement | WebRTC direct, no relay/TURN/signaling server |
| Session-only | Closing either tab ends connection |
| Read-only | Viewer cannot write to source IndexedDB |
| LAN-scoped | ICE candidates are local IPs only (no TURN = no internet relay) |
| Authenticated | DTLS fingerprint in offer/answer = MITM-proof once paired |

---

## Implementation Phases

### Phase 1: SDP compression + QR

- `peer-sdp.js` — extract/reconstruct minimal SDP
- `peer-qr.js` — QR generation (canvas-based, no dependency)
- Test roundtrip: compress → QR → decode → valid SDP

### Phase 2: WebRTC + DataChannel

- `peer-rtc.js` — offer/answer flow, DataChannel setup
- `peer-protocol.js` — request/response over DataChannel
- Test on two tabs same machine first, then cross-device LAN

### Phase 3: Source UI

- `share-source.js` — QR display, webcam scanner, paste fallback
- Settings drawer integration
- Wake lock extension

### Phase 4: Viewer UI

- `share-viewer.js` — answer display (QR + copy button)
- Viewer mode (read-only trait grid)
- `viewer-bar.js` — connection status banner

---

## Open Questions

1. **QR library** — Generate with canvas (no dep) or bundle a tiny lib
   like `qr-creator` (~4KB)? Recommend canvas for zero-dep consistency.

2. **Webcam scanning** — Use `BarcodeDetector` API (Chrome/Edge native,
   no library needed) with fallback to `jsQR` for Firefox/Safari?

3. **Multiple viewers** — Allow multiple phones to scan the same QR?
   The offer would need to support multiple answers (multiple peer
   connections). Recommend: one QR per viewer, source can click
   "Add another device" to generate a fresh offer.

4. **Timeout** — Auto-stop sharing after N minutes of inactivity?
   Recommend 30 min idle timeout with "extend" prompt.
