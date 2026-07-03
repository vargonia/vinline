// vinline — configuration: credentials, presets, parse prompt
// ─── CREDENTIALS ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '389113702208-oikpagdsaqp1on4c87liosfl9tm044jv.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyDg4N-4bOs9HVLel6dLfnYzfErIT50It3c';
const MICROSOFT_CLIENT_ID = 'YOUR_AZURE_CLIENT_ID'; // Azure App Registration → replace when ready
const ANTHROPIC_API_KEY = ''; // set via serve.ps1 -AnthropicKey flag or browser prompt — never commit the real key
// When opened as file://, relative URLs break — point at the local proxy server instead
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
const msalConfig = {
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: { cacheLocation: 'sessionStorage' }
};
// ─── EXPORT / PREVIEW STYLE PRESETS ──────────────────────────────────────────
const CAT_ORDER = ['Sparkling', 'White', 'Rosé', 'Orange', 'Red', 'Dessert', 'Sake', 'Vermouth', 'Other'];

const FONT_PAIRINGS = [
  { id: 'modern',   label: 'Modern',    head: "'DM Sans',sans-serif",           headWeight: 500, body: "'DM Mono',monospace" },
  { id: 'classic',  label: 'Classic',   head: "'Playfair Display',serif",       headWeight: 600, body: "'DM Sans',sans-serif" },
  { id: 'elegant',  label: 'Elegant',   head: "'Cormorant Garamond',serif",     headWeight: 500, body: "'DM Sans',sans-serif" },
  { id: 'mono',     label: 'Editorial', head: "'DM Mono',monospace",            headWeight: 400, body: "'DM Sans',sans-serif" },
];

const COLOR_SWATCHES = [
  { id: 'ink',      label: 'Ink',      hex: '#1C1B18' },
  { id: 'green',    label: 'Green',    hex: '#1A6B50' },
  { id: 'burgundy', label: 'Burgundy', hex: '#6B1A2B' },
  { id: 'charcoal', label: 'Charcoal', hex: '#33312C' },
  { id: 'gold',     label: 'Gold',     hex: '#9A7B2E' },
  { id: 'blue',     label: 'Blue',     hex: '#1A4A7A' },
];

const SPACING_PRESETS = { compact: { unit: '4px' }, cozy: { unit: '8px' }, spacious: { unit: '14px' } };

const COLUMN_OPTIONS = [{ value: 1, label: '1 column' }, { value: 2, label: '2 columns' }];
const SPACING_OPTIONS = [{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }];
const PAPER_SIZE_OPTIONS = [{ value: 'letter', label: 'Letter' }, { value: 'a4', label: 'A4' }];

const EXPORT_STYLE_KEY = 'vinline_export_style_v1';

// ─── INVOICE PARSE PROMPT ────────────────────────────────────────────────────
const INVOICE_PARSE_PROMPT = `You are an expert at reading wine distributor invoices. Extract every wine line item and return a JSON array.

IMPORTANT — BOL WITHOUT PRICES: If the document is a Bill of Lading with NO price column (Garber & Company BOLs with "garberandcompany.com", Real Wine/Farm Cottage Wines BOLs with "realwineusa.biz", or any BOL that only shows Locations/Producer/Description/Vintage/Quantity with no cost column), return an empty array: []

If multiple invoices appear in one photo, parse ALL of them and combine into one array.

SKIP these line items:
- CRV / recycling deposits: any line with "CRV", "recycling", "deposit", "CA-CRV", "FEESCRV", "Misc Fee", "Non-Product Description", or price ≈ $0.10/unit
- Freight, delivery fees, split-case charges, "RECYCLING DEPOSIT CHANGE"
- Lime Ventures invoices sell beer/cans/non-wine — skip ALL items from Lime Ventures
- Any item with no price or $0 price

For each wine/sake/vermouth, return an object with exactly these fields:

"name": Display name — "Producer, WineName Vintage"
  • Proper title-case; preserve particles (d', di, de, del, les, la, le, von, etc.)
  • No alcohol%, DOC/IGT/AOC/appellation designations, bottle size, SKU codes, or importer name prefixes
  • If wine has a distinct named cuvée, add it in quotes: "Paltrinieri, Lambrusco \\"Pira\\" 2023"
  • Examples: "Lafon, Milly-Lamartine 2024" / "Cirelli, Orange NV" / "Akilia, Clarete 2023" / "Folk Machine, Grenache 2023" / "Ramey, Claret North Coast 2022" / "Chermette, Beaujolais Origine 2024" / "Sunier, Régnié 2023"

"vintage": Year string ("2024") or "NV". null only if completely unknown.

"size": Bottle size e.g. "750ml", "1L", "500ml", "300ml", "720ml". Default "750ml".

"qty_bottles": Total BOTTLES as integer. Derive from cases × bottles_per_case.
  Get bottles_per_case from PACK/SIZE/FORMAT column:
  "12/750ml" or "12x750" → 12 | "6/750ml" or "6x750" → 6 | "6x720" → 6 | "15x300" → 15 | "24/375ml" → 24 | "1/1.5L" → 1
  If QTY is fractional cases (Grapevine), round(QTY × bottles_per_case).

"cost_per_bottle": Per-bottle wholesale cost, decimal, 2 decimal places, no $ sign.

"region": Human-readable e.g. "Beaujolais, France" / "Loire Valley, France" / "Etna, Sicily" / "Lambrusco, Italy" / "Sta. Rita Hills, California" / "Austria" / "Jerez, Spain". Infer from appellation/grape/producer origin.

"category": Exactly one of: "Sparkling", "White", "Rosé", "Orange", "Red", "Dessert", "Sake", "Vermouth"
  Sparkling: Champagne, Crémant, Cava, Prosecco, Pétillant Naturel, sparkling/mousseux/sekt
  White: Chardonnay, Sauvignon Blanc, Pinot Gris/Grigio, Riesling, Grüner Veltliner, Muscadet, Sancerre, Mâcon, Soave, Verdicchio, Blaufränkisch Weiss, white Burgundy/Bordeaux, Fino/Manzanilla Sherry
  Rosé: pink/rosé wines
  Orange: skin-contact/amber wines — look for "orange", "skin contact", "ramato", "skin-fermented", "amber"
  Red: red grapes or red appellations (Burgundy, Barolo, Rioja, Beaujolais, Grenache, Syrah, etc.)
  Dessert: late-harvest, Sauternes, Port, Oloroso/Amontillado/Pedro Ximénez Sherry, Madeira, ice wine
  Sake: any Japanese rice wine (Junmai, Daiginjo, Honjozo, etc.)
  Vermouth: any vermouth product
  Default "Red" if ambiguous.

━━━ DISTRIBUTOR-SPECIFIC RULES ━━━

BEAUNE IMPORTS (dot-matrix paper, header "Beaune Imports", columns QTY/ITEM/UNIT PRICE/DISC%/TAX/TOTAL):
  • ITEM format: "SKU# — VINTAGE Appellation, Producer" → name = "Producer, Appellation VINTAGE"
  • QTY = cases (12 bottles each). UNIT PRICE = per-case.
  • cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip "CA-CRV2" line

LYRA FINE WINE (header "LYRA Fine Wine Importers", columns QTY/PACK/CODE/ITEM/UNIT PRICE/DISC%/TOTAL):
  • ITEM format: "Producer, CuveeName AppellationType VINTAGE - X% alc by vol"
  • QTY = cases. UNIT PRICE = per-case. cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip FEESCRV line

DANCH & GRANGER SELECTIONS (header "Danch and Granger Selections", columns QTY/PACK/CODE/ITEM/UNIT PRICE/DISC%/TOTAL):
  • ITEM format: "VINTAGE Producer WineName VINTAGE size/pack" — strip trailing size/pack info
  • QTY = cases. UNIT PRICE = per-case. cost_per_bottle = UNIT_PRICE × (1 − DISC%/100) / 12
  • Skip "CA CRV /Bottle" line

GRAPEVINE WINE BROKERS (header "GRAPEVINE WINE BROKERS", columns QTY/PACK/CODE/ITEM/UNIT PRICE/BTL PRICE/DISC%/TOTAL):
  • Has BTL PRICE column — use that directly for cost_per_bottle
  • ITEM is ALL-CAPS "VINTAGE PRODUCER APPELLATION CUVÉE" — normalize capitalization
  • Skip GWBCRVBTL / "CA CRV BOTTLE" line

CHAMBERS & CHAMBERS (header "CHAMBERS & CHAMBERS WINE MERCHANTS", columns PRODUCT CODE/DESCRIPTION/SIZE/QTY SHIPPED/LIST PRICE/DISC.%/DISC.$/NET UNIT PRICE/EXTENSION):
  • SIZE column gives pack: "12x750"→12, "6x750"→6, "6x720"→6, "15x300"→15
  • cost_per_bottle = NET UNIT PRICE / bottles_per_case (NET already after discount)
  • qty_bottles = QTY SHIPPED (CASES column) × bottles_per_case
  • Wakatake/Ohyama/any "Junmai/Daiginjo" items → category "Sake"
  • Sorso Vermouth or any vermouth → category "Vermouth"
  • Alvear Fino/any Fino/Manzanilla Sherry → category "White"
  • Skip CRV entries (shown separately below each wine line)

SKURNIK (BOL on yellow paper, columns LINE/ITEM NO/QTY/SOM/DESCRIPTION/CASES PACKS/LIST UNIT PRICE/DISC%/NET CASE PRICE/NET BTL PRICE/AMOUNT):
  • NET BTL PRICE column = cost_per_bottle (use directly)
  • If NET BTL PRICE missing, use NET CASE / bottles_per_case
  • Skip "RECYCLING DEPOSIT CHANGE" / split-case lines

ALLUVIAL WINES & SPIRITS / HOBO WINE CO (REVEL WINE) / ELENTENY IMPORTS — SAME FORMAT:
  • Identified by: "INVOICE No AW#####", "INVOICE No ######", or "INVOICE No INV######" in header
  • Columns: Product Description | Bottles | Cases | Case Price | Total
  • cost_per_bottle = Case Price / bottles_per_case (get bottles_per_case from "[750 mL@12/c]" style in description)
  • qty_bottles = Cases × bottles_per_case
  • Description format: "[Optional brand/importer prefix] VINTAGE Producer WineName [size@N/c] [nickname] Item # CODE"
    Strip leading brand prefix (e.g. "Mission Wine Merchants", "Folk Machine 2023 Folk Machine", "Hobo Wine Co")
    Extract: vintage, producer name, wine name
  • Skip "Non-Product Description" CRV lines ("Misc Fee - CA CRV", "Misc Fee - Hobo CRV", etc.)

GARBER & COMPANY BOL (header "BOL: Delivery", sold by garberandcompany.com, columns: Locations/ID#/Format/#/c/Producer/Description/Vintage/Varietal/Quantity — NO PRICE COLUMN):
  • Return []

REAL WINE / FARM COTTAGE WINES BOL (header "BOL: Delivery", sold by realwineusa.biz, columns: Locations/SD#/Format/#s/Producer/Description/Vintage/Varietal/Quantity — NO PRICE COLUMN):
  • Return []

Return ONLY a valid JSON array with no other text, markdown, or explanation:
[{"name":"...","vintage":"...","size":"750ml","qty_bottles":12,"cost_per_bottle":18.50,"region":"...","category":"Red"}]`;

export {
  GOOGLE_CLIENT_ID, GOOGLE_API_KEY, MICROSOFT_CLIENT_ID, ANTHROPIC_API_KEY, API_BASE, msalConfig,
  CAT_ORDER, FONT_PAIRINGS, COLOR_SWATCHES, SPACING_PRESETS,
  COLUMN_OPTIONS, SPACING_OPTIONS, PAPER_SIZE_OPTIONS, EXPORT_STYLE_KEY, INVOICE_PARSE_PROMPT
};
