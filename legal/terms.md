> **DRAFT — not yet reviewed by counsel. For personal/noncommercial use of a free tool.**

# Terms of Service

_Last updated: 2026-07-03_

These terms cover your use of vinline (the "Service"), a free, noncommercial tool that reads wine-distributor invoices and helps you build priced wine lists. The Service is operated by the operator ("we," "us," "our"). Please read these terms before using the Service. They are written to be short and readable, because vinline is a free tool, not a paid product.

## Acceptance

By using the Service, you agree to these terms. If you do not agree, please do not use the Service. If you use the Service on behalf of a restaurant, venue, or other organization, you confirm that you are authorized to accept these terms for them.

## Description of the service

vinline lets you upload or forward wine-distributor invoices (as images or PDFs), sends them to Anthropic's Claude API to extract wine names, vintages, and costs, and helps you organize the results into a priced wine list you can style and export. Your inventory, wine lists, and style settings are stored only in your own browser (in localStorage) — we do not keep a copy on a server, and there is no account or database by default. See our Privacy Policy for the full picture of how data moves through the Service.

## Parsing credentials and API costs (BYOK)

Invoice parsing requires access to Anthropic's Claude API. There are two ways to supply that access:

- **Your own Anthropic API key (BYOK — "bring your own key").** You may enter your own Anthropic API key, which stays in your browser and is forwarded with each parse request. When you use your own key, **you are responsible for all usage and costs billed to that key by Anthropic**, and your use is governed by Anthropic's own commercial terms. We do not see, store, or control your Anthropic billing.
- **An instance access code.** The operator may issue an access code that lets you parse invoices using the operator's own server-side key. Access-code usage is a courtesy, may be rate-limited, and **may be limited, suspended, or revoked at any time**, with or without notice, including to control abuse or cost. Access codes are not a paid entitlement and come with no guarantee of availability.

You are responsible for keeping any credentials you use (your API key or an access code) reasonably secure and for not sharing an access code beyond its intended use.

## Acceptable use

You agree to use the Service only for its intended purpose — reading legitimate invoices and building wine lists — and not to:

- abuse, overload, or attempt to circumvent the rate limits or abuse controls on the parsing proxy or any other endpoint;
- submit content that is illegal, that you have no right to submit, or that is not a genuine invoice or related business document;
- attempt to reverse the operator's server-side key out of the proxy, or use an access code to resell or provide parsing to third parties;
- probe, scan, or attempt to breach the Service, or interfere with its normal operation for others.

We may apply rate limits and other technical measures, and may throttle or block usage that appears abusive.

## Your content and your responsibility

You keep all rights to the invoices and data you put into the Service. Because parsing is automated, **the accuracy of extracted data is not guaranteed.** Vision models can misread a vintage, a price, a producer, or a unit — especially on low-quality scans or unusual invoice layouts.

**Always verify prices and details before you publish a menu.** The Service assists you; it does not replace your judgment. You are solely responsible for the wine list you publish, including its prices, availability, and any legal or regulatory requirements that apply to your menu. Do not treat parsed output as final without checking it against the source invoice.

## No warranty

The Service is provided **"as is" and "as available," without warranties of any kind**, express or implied, including any implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that parsed data will be correct. Third-party services the Service relies on (such as Anthropic's API, Google's APIs, and the hosting provider) are outside our control and carry their own terms.

## Limitation of liability

To the fullest extent permitted by law, the operator will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising out of or relating to your use of the Service — including any losses caused by inaccurate parsed data, an incorrectly priced menu, downtime, or loss of data stored in your browser. Because the Service is provided free of charge, the operator's total aggregate liability to you for any claim relating to the Service will not exceed **one hundred U.S. dollars (US$100)**. Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.

## License

vinline's software is licensed under the **PolyForm Noncommercial License 1.0.0**, © 2026 Andrew Icardi. The Service is offered for personal and noncommercial use. See the [LICENSE](../LICENSE) file for the full license text. These Terms of Service govern your use of the hosted Service and are separate from the software license that governs the source code.

## Modifications to the service and these terms

The Service is under active development and may change, add, remove, or break features at any time. We may also update these terms; when we do, we will update the "Last updated" date above. Continued use of the Service after a change means you accept the updated terms. If a change is material, we will make a reasonable effort to note it.

## Termination

You may stop using the Service at any time. To remove your data, clear your browser's site data for the Service or use the in-app discard controls — because your data lives in your browser, this removes it. We may suspend or discontinue the Service, or revoke an access code, at any time and for any reason, including suspected abuse. The sections on your responsibility, no warranty, limitation of liability, and governing law survive termination.

## Governing law

These terms are governed by the laws of the State of California, USA, without regard to its conflict-of-laws rules. Any dispute relating to the Service will be brought in the state or federal courts located in California, and you consent to their jurisdiction, to the extent permitted by law.

## Contact

Questions about these terms? Contact the operator at [CONTACT-EMAIL](mailto:[CONTACT-EMAIL]).
