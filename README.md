# vinline

A personal tool for sommeliers: photograph or scan a wine distributor invoice, let Claude read it, review prices and margins in an interactive inventory, then publish a styled wine list to Google Sheets, Google Docs, or PDF.

**Concept:** Input `]` (email scan) → Inventory `][` (price review) → Output `[` (publication)

---

## Features

### Input
- **Gmail scanning:** connect your inbox, Claude finds invoices in the last 180 days
- **Outlook scanning:** connect your Outlook inbox (OAuth pending Azure registration)
- **File upload:** photograph or PDF an invoice, upload directly
- **Attachment parsing:** click a Gmail card to parse its attached invoice

### Inventory
- **Real AI parsing:** Claude vision API reads printed and photographed invoices from 10+ distributor formats (Beaune Imports, Lyra, Danch & Granger, Grapevine, Chambers & Chambers, Skurnik, Alluvial/Hobo/Elenteny, and more — including BOL detection)
- **Structured data:** wine name, vintage, region, size, cost, suggested markup extracted
- **Inline margin editor:** slider-based multiplier (1× to 6×, default 4×) with real-time sell price
- **Glass prices:** toggle per-item for-the-glass cost (locks to wholesale cost)
- **Duplicate detection:** when you push to the wine list, the app flags wines with similar names already in the list, with per-item override ("push anyway")
- **Inventory health:** tags show "on list" (already published), "30d+ age" (hasn't been re-ordered recently)
- **Persistence:** inventory and parsed state survive page refresh via localStorage (vinline_app_state_v1)
- **Undo:** sold/discard actions have 6-second undo toast

### Wine List
- **Auto-categorization:** pushed items sort into labeled sections by type (Sparkling → White → Rosé → Orange → Red → Dessert → Sake → Vermouth → Other)
- **Smart merge:** pushing the same wine twice flags the duplicate instead of re-adding
- **Direct editing:** click wine names or prices in the list to correct them
- **Persistence:** wine list state survives page refresh

### Export
- **Google Sheets sync:** push the wine list to a pre-selected Google Sheet (three columns: Wine, Vintage & Region, Price)
- **Google Docs sync:** push to a Google Doc as formatted plain text
- **Auto-sync:** after one manual sync to Drive, the app auto-syncs when you edit (optional, arms after first manual push)
- **PDF export:** style editor with curated fonts, colors, section reorder, logo upload, then print-to-PDF (via Ctrl+P, supports Letter and A4, 1–2 column layout, auto-paginate)

### Reliability
- **Full localStorage persistence:** wine list, inventory, export style config, Gmail/Drive/Outlook connection state all survive refresh
- **Token management:** 401-expiry detection for Gmail, Drive, and Outlook; automatic revocation on disconnect
- **Narrowed OAuth scopes:** Gmail (gmail.readonly), Drive (drive.file — only appends/overwrites file you chose), userinfo.email
- **No hardcoded API keys:** Anthropic key runs through server-side PowerShell proxy (serve.ps1), never exposed to browser

---

## Quickstart

### Prerequisites
- Windows with PowerShell 5.1+
- A modern browser (Chrome, Edge, Firefox, Safari)
- Anthropic API key (from console.anthropic.com, under icardiandrew@gmail.com)
- Google Cloud OAuth setup (optional, needed for Gmail/Drive features)

### 1. Create a gitignored wrapper script

Create `serve.local.ps1` in the project root (will not be committed):

```powershell
# serve.local.ps1 (gitignored — stores your real API key)
$ANTHROPIC_KEY = 'sk-ant-...' # paste your real key here
.\serve.ps1 -AnthropicKey $ANTHROPIC_KEY
```

### 2. Start the server

```powershell
# In PowerShell from C:\Users\andre\Desktop\vinline
.\serve.local.ps1
```

### 3. Open the app

```
http://localhost:8000/app/
```

---

## Credentials Setup

### Anthropic API Key (required for parsing)

1. Go to **console.anthropic.com**
2. Sign in as **icardiandrew@gmail.com**
3. Navigate to **API keys** → **Create key**
4. Copy the key
5. Paste it into `serve.local.ps1` as shown above

The key runs server-side inside `serve.ps1` and is never exposed to the browser.

### Google Cloud (required for Gmail/Drive features)

The app uses OAuth client **vinline-499619** (under icardiandrew@gmail.com):

- **Client ID:** `389113702208-oikpagdsaqp1on4c87liosfl9tm044jv.apps.googleusercontent.com`
- **Authorized JS origin:** `http://localhost:8000`
- **Enabled APIs:** Gmail API, Google Drive API, Google Picker API
- **Scopes:** `gmail.readonly`, `userinfo.email`, `drive.file`
- **Test mode:** only test user `icardiandrew@gmail.com` is authorized

**To enable for your own account:**
1. Go to **console.cloud.google.com** (Google Cloud Console)
2. Create a new project
3. Enable Gmail API, Google Drive API, Google Picker API
4. Create an OAuth 2.0 desktop application client
5. Add `http://localhost:8000` as an authorized JS origin
6. Copy your client ID and paste it into `app/js/config.js` (`GOOGLE_OAUTH_CLIENT_ID`)
7. For Google Picker, create an API key and enable the Picker API restriction, add `localhost:8000` as referrer

### Outlook (deferred, pending Azure App Registration)

Outlook OAuth infrastructure is wired but not yet configured. To enable:

1. Go to **portal.azure.com**, create a new App Registration under your Microsoft account
2. Note the Application (client) ID
3. Add `http://localhost:8000` as a Redirect URI
4. Update `MICROSOFT_CLIENT_ID` in `app/js/config.js`

---

## Architecture

### No build step
- Plain ES modules, no bundler
- Imports run client-side via script tags in `app/index.html`
- All state lives in the DOM and localStorage — the DOM is the source of truth

### Module map
| Module | Responsibility |
|--------|-----------------|
| `main.js` | Entry point, window bridge for inline handlers (onclick), init |
| `config.js` | OAuth credentials, API keys, parse prompt template |
| `state.js` | localStorage persistence (vinline_app_state_v1), rehydration |
| `utils.js` | String/array utilities, validators |
| `auth.js` | Gmail and Outlook OAuth login/logout, token management |
| `drive.js` | Google Drive Picker, Sheet/Doc sync, auto-sync, revocation |
| `inbox.js` | Email scan (Gmail/Outlook), file upload, email card UI |
| `core.js` | Parse pipeline, inventory rows, margin system, wine list, duplicate detection, undo, persistence snapshots |
| `exporter.js` | Style editor, PDF generator via print dialog |
| `ui.js` | Stage animations, modals, focus traps, toasts, keyboard navigation, accessibility |

### Persistence design
- **DOM truth:** Wine list, inventory, connection state all render from the DOM
- **Snapshots:** `persistNow()` (core.js) saves DOM state to localStorage (vinline_app_state_v1, vinline_export_style_v1)
- **Rehydration:** on page load, `rehydrateFromState()` reads localStorage and rebuilds the DOM

### Window bridge pattern
Inline onclick handlers (e.g., `onclick="connectGmail()"` in HTML) work because `main.js` does:
```javascript
Object.assign(window, { connectGmail, parseInvoice, pushToWineList, ... });
```
This exposes module functions to the global scope while keeping the actual code modular.

### Project layout

```
C:\Users\andre\Desktop\vinline\
├── app/                          # Production multi-file app (ES modules)
│   ├── index.html                # Main markup, script tags, inline onclick handlers
│   ├── css/
│   │   └── styles.css            # All styles (no component CSS)
│   └── js/
│       ├── main.js               # Entry, window bridge
│       ├── config.js             # Credentials, prompts
│       ├── state.js              # Persistence layer
│       ├── utils.js              # Utilities
│       ├── auth.js               # Gmail/Outlook OAuth
│       ├── drive.js              # Drive sync, Picker
│       ├── inbox.js              # Email scan, file upload
│       ├── core.js               # Parse, inventory, wine list, duplicates
│       ├── exporter.js           # Style editor, PDF
│       └── ui.js                 # Modals, animations, a11y
├── iterative/                    # Historical dev builds
│   ├── vinline.dev.001.html      # ... through .009.html
│   └── vinline.009.preview.html  # Latest single-file reference
├── main/                         # Stable production builds
│   ├── vinline.001.html          # ... through .009.html
├── serve.ps1                     # PowerShell HTTP server + /api/claude proxy
├── serve.local.ps1              # (gitignored) Wraps serve.ps1 with real API key
└── README.md                     # This file

C:\Users\andre\Documents\vinline\vinline\   # Obsidian vault (planning & reference)
├── Home.md                       # Vault home
├── architecture/app-structure.md # Module map, persistence, history
├── builds/iterative-track.md     # Dev build history
├── for-the-sommelier/
│   ├── how-to-use.md            # User guide
│   └── ...
├── tasks/next-actions.md         # Roadmap
└── tasks/qa-checklist.md         # QA script
```

---

## Roadmap

### Phase 1: Client-side app (shipped)
- ✅ Full OAuth (Gmail, Drive, Outlook bones)
- ✅ File upload + Claude vision parsing
- ✅ Inventory management with margins
- ✅ Wine list auto-categorization
- ✅ Drive sync (Sheet/Doc)
- ✅ PDF style editor
- ✅ Full localStorage persistence
- ✅ Duplicate detection
- ✅ Undo (sold/discard)
- ✅ Inventory health tags
- ✅ Accessibility (WCAG, keyboard nav, reduced-motion)

### Phase 2: Backend (designed, not yet built)
Designed in `C:\Users\andre\Documents\vinline\vinline\plans\backend-*.md`:
- Multi-device sync (accounts, API)
- Persistent server-side wine list
- OAuth refresh token storage
- Integration with sommelier workflow (iOS app)
- Team sharing (venue staff)
- Historical pricing and margin tracking

**Current constraint:** No Node/Python/Docker on this machine — phase 2 requires a separate backend (Fastify/Postgres/Redis on Railway). This is intentional and documented.

### Phase 3: Outlook OAuth
Pending Azure App Registration. Infrastructure wired; credentials not yet set up.

---

## Notes for the owner

- **Ownership:** This is a personal project. All Google Cloud resources (client ID, API key, project `vinline-499619`) are registered under `icardiandrew@gmail.com` — not associated with High Treason.
- **Single-file history:** The `iterative/` folder holds the dev builds (001–009, all in single .html files) that led to this multi-file structure. These are retained for reference but are superseded by `app/` as the active build.
- **Persistence model:** State never leaves the browser (or Drive, by user choice). No backend to authenticate against. The Anthropic key runs server-side, accessible only via localhost.

---

## Support

For questions, setup help, or feature requests, see the Obsidian vault:
**C:\Users\andre\Documents\vinline\vinline\**

- **How to use:** `for-the-sommelier/how-to-use.md`
- **Known issues:** `tasks/next-actions.md` (Known issues section)
- **Architecture details:** `architecture/app-structure.md`
