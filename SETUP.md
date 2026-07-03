# Welcome to vinline

## What is vinline?

vinline turns wine distributor invoices into styled wine lists. Photograph or scan an invoice → the app reads it with AI → you review the prices and margins → publish to PDF, Google Sheets, or Google Docs. It's built for sommeliers and wine bar managers who need to get new wines into service quickly.

**The loop:** Snap a photo of an invoice → vinline reads it → edit markups in seconds → export a styled wine list → share with your team.

---

## What You Need

### 1. A Modern Browser
- Chrome, Edge, Firefox, or Safari (anything from the last 3 years)
- JavaScript enabled

### 2. Parsing credentials — an access code OR your own API key

**Easiest: an access code.** If the person who shared vinline with you gave you an access code, that's all you need — skip to First Run and paste it into **Settings → Access code**. Your parses use the instance owner's account.

**Otherwise: your own Anthropic API key.**

1. Go to **console.anthropic.com**
2. Sign up or log in with your email
3. Navigate to **API keys** → **Create key**
4. Copy the key (starts with `sk-ant-`)
5. **You'll paste it into vinline's Settings in the first step below**

**Cost:** Each invoice parse costs roughly $0.01–$0.05 (most invoices are a few hundred lines). You control your usage and bill — stop anytime.

### 3. (Optional) Google Account
If you want to use Gmail scanning or Google Drive sync (see below), you'll need a Google account. The site owner must add your email as a test user first — ask them for this.

---

## First Run

### Step 1: Open the App
Click the link the site owner shared. You'll see the vinline interface.

### Step 2: Add Your Credentials
1. Click **Settings** (top right corner)
2. Find the **Claude API key** card
3. **If you have an access code:** scroll to the **Access code** field inside that card, paste it, click **Save** — done
4. **If you have your own key:** paste it into the key field and click **Save**

Either one is stored **only in your browser's private storage**. Your own key is never sent to anyone but Anthropic (for parsing) — the site owner can't see it.

### Step 3: Upload an Invoice
1. Click the **Input** card (left side)
2. Click **Upload invoice photo** or **Upload PDF**
3. Choose a photo of a wine distributor invoice or a PDF
4. vinline reads it with AI — takes 5–10 seconds

### Step 4: Review Prices & Margins
The app shows a table of wines with their wholesale costs. Each wine has a **Markup** slider (default 4×, meaning 4× the cost = retail price). Adjust the slider to set your profit margin. Toggle **Glass** to set a per-glass cost.

### Step 5: Push to Wine List
Click **Push to wine list** to add the wines to your list. The app automatically groups them by type (Red, White, Sparkling, etc.). You can edit the wine names or prices directly in the list if needed.

### Step 6: Export
**PDF:** Click **Export as PDF** to open a style editor. Choose fonts, colors, layout (1 or 2 columns), upload a logo or header image, then **Download PDF**. Use Ctrl+P to print to PDF or save as a file.

**Google Sheets/Docs:** Click **Sync to Sheets** or **Sync to Docs** to push your list to Google Drive (requires the site owner to add you as a test user). After the first sync, the app auto-syncs every time you edit.

---

## Core Workflow

```
Photograph invoice
        ↓
Upload to vinline
        ↓
AI reads and extracts wines
        ↓
You set markups (4× default)
        ↓
Push to wine list
        ↓
Edit names or prices (optional)
        ↓
Export as PDF, Sheets, or Docs
        ↓
Done — wines are in service
```

The whole flow takes 2–5 minutes per invoice.

---

## Optional: Google Features

### Gmail Scanning
If enabled by the site owner, you can connect your Gmail and vinline will scan for invoices in recent emails. Click **Input** → **Connect Gmail**, then choose a folder.

**Requirements:**
- Your email must be added as a test user by the site owner
- The app requests read-only access to your email (no sending, no deleting)

### Google Drive Sync
Push your wine list directly to a Google Sheet or Google Doc. Click **Sync to Sheets** or **Sync to Docs**, pick a file, then let vinline auto-sync as you edit.

**Requirements:**
- Your email must be added as a test user by the site owner
- The app requests access to files you choose (not your entire Drive)

### How to Get Access
If Gmail or Drive icons don't work, ask the site owner to:
1. Add your email to the OAuth test users (in console.cloud.google.com project vinline-499619)
2. Confirm the Railway domain is in the OAuth client settings

Without this, you can still:
- Upload invoices manually (photo or PDF)
- Export as PDF directly
- Copy/paste into Sheets or Docs yourself

---

## Troubleshooting

### "Please add your key in Settings" error
Your Anthropic key is missing, expired, or invalid.
- Go to Settings → paste your key again
- If you've used up your credits, add a new payment method at console.anthropic.com

### Gmail or Drive buttons don't work
The app owner hasn't added you as a test user, or the domain isn't configured. Ask them to check the setup docs.

### PDF export looks wrong
- Try downloading instead of printing
- Use Chrome or Edge for the best font rendering
- Check that your logo image is smaller than 2 MB

### Wine list disappeared after I closed the browser
It shouldn't — vinline saves everything in your browser's storage. If you cleared browser data (cookies, cache), that erases the list. Try uploading the invoice again.

---

## Privacy & Security

- **Your wine list** stays in your browser. Nothing is saved on a server.
- **Your Anthropic key** is only used for parsing — never stored or logged.
- **Google tokens** (if you connect Gmail or Drive) are never stored after you disconnect. Disconnect anytime in Settings.
- **No tracking:** No analytics, no ads, no data collection.

---

## License

vinline is free for personal and noncommercial use. See the LICENSE file in the repo for details (PolyForm Noncommercial 1.0.0).

---

## Questions?

See the **How to Use** guide or **Known Issues** in the Obsidian vault (if the site owner has shared access). Or reach out to the person who shared the link — they can help troubleshoot.

Good luck with your wine list!
