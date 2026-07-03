> **DRAFT — not yet reviewed by counsel. For personal/noncommercial use of a free tool.**

# Privacy Policy

_Last updated: 2026-07-03_

This policy explains what happens to your data when you use vinline (the "Service"), a free, noncommercial tool that reads wine-distributor invoices and helps you build priced wine lists. The Service is operated by the operator ("we," "us," "our"). The short version: **your data lives in your own browser, we have no database, and we do not sell or track anything.**

## What we store

**Nothing on our servers.** The Service has no database. Your inventory, your wine lists, and your style settings are stored **only in your own browser**, using the browser's `localStorage`. That data never leaves your device except when you explicitly send an invoice for parsing, sync to Google Drive, or (if enabled) submit an error report — each described below.

Because this data lives in your browser:

- It stays on the device and browser you used. It does not sync between devices on its own.
- **To erase it, you can either** use the in-app discard controls to clear your inventory and lists, **or** clear the site's data in your browser (browser settings → site data / "clear browsing data" for this site). Clearing browser data removes it completely.

## What passes through the Service

Some data moves through the Service transiently to make features work. We do not retain it.

- **Invoice images and PDFs → Anthropic (Claude API).** When you parse an invoice, its image or PDF is sent through the Service's own proxy to Anthropic's Claude API, which extracts the wine data. **The proxy forwards the request and does not retain the invoice.** Anthropic's processing of that request is governed by Anthropic's API terms; per Anthropic's policy, data submitted through their API is not used to train their models. We reference Anthropic's commercial terms rather than restating them here.
- **Error reports (if enabled).** The Service may send basic client error telemetry to help us fix bugs: a JavaScript error message, its stack trace, and the app version, POSTed to the Service's own `/api/log` endpoint, where it appears in the server's logs. These reports contain no cookies, no analytics identifiers, and no invoice contents. Please avoid pasting sensitive data into contexts that could appear in an error message.

## Your parsing credentials

Parsing requires access to Anthropic's Claude API, supplied one of two ways:

- **Your own Anthropic API key (BYOK).** If you enter your own key, it is stored **only in your browser's `localStorage`** and forwarded with each parse request via a request header. We do not store your key on our servers.
- **An instance access code.** If the operator issues you an access code, the operator's own server-side key is used when you present a valid code. For abuse and cost control, the Service records **only metadata about each request — a count and a timestamp. It does not record the invoice contents.**

## Google integration (optional)

If you connect Google Drive (and, where offered, Gmail), the following applies:

- **Tokens are held in memory only.** Google OAuth access tokens are kept in memory for the duration of your session and are **never written to disk or a database.** They are short-lived and expire on their own.
- **Scopes.** The Service uses the Google-verified scopes `gmail.readonly` (read-only access to scan for invoice emails) and `drive.file` (access limited to files you create or explicitly pick). It does not request broad Drive access.
- **Disconnecting revokes access.** Clicking Disconnect revokes the token with Google server-side, not just in the interface.
- **Testing mode.** While the Service's Google OAuth app is in testing mode, Google features work only for accounts that have been allow-listed as test users.

### Google API Services User Data Policy — Limited Use disclosure

vinline's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the **Limited Use** requirements. Specifically, data obtained through Gmail and Drive scopes is used **only** to provide and improve the user-facing invoice-ingestion and wine-list features you invoke; it is **not** transferred to or sold to third parties except as needed to provide those features, is **not** used for advertising, and is **not** used for any purpose unrelated to those features. No human reads this Google data except with your explicit consent, to comply with law, or as needed for security or abuse prevention.

## Third parties

The Service relies on a small number of third parties, each with its own privacy terms:

- **Anthropic** — processes invoice images to extract wine data via the Claude API.
- **Google** — provides optional Drive/Gmail integration for accounts that connect it.
- **Railway** — hosts the Service. Standard, transient server logs may briefly contain request metadata (such as IP addresses) as part of normal operation; we do not build profiles from these logs or retain IP addresses beyond the host's ordinary transient logging.
- **Google Fonts** — the Service's fonts are imported from Google's font CDN, so your browser loads font files from Google's servers when you open the Service. This means Google's servers see a standard font request from your browser.

## No cookies, trackers, ads, or data sales

The Service does **not** use cookies, does **not** use third-party analytics or advertising trackers, does **not** show ads, and does **not** sell or rent your data. There are no marketing pixels or cross-site trackers.

## Children

The Service is a professional tool for people working with wine lists and is **not directed to children under 13.** We do not knowingly collect personal information from children under 13.

## Changes to this policy

We may update this policy as the Service evolves. When we do, we will update the "Last updated" date above. Material changes will be noted with reasonable effort.

## Contact

Questions about privacy? Contact the operator at [CONTACT-EMAIL](mailto:[CONTACT-EMAIL]).
