# vinline

A wine inventory management app that streamlines the process from distributor invoice to wine list.

## Tracks

### main/
Production-direction builds. Each version represents a stable, reviewed iteration.

| Build | Description |
|-------|-------------|
| vinline.001 | Initial three-panel UI with bracket logo, collapse/expand animation |
| vinline.002 | Invoice hover popups, margin indicator, wine list dollar signs, Drive sync button |
| vinline.003 | Consistent sync buttons across input/output panels |
| vinline.004 | Inline margin slider replacing edit button, photo upload entry point |
| vinline.005 | Multiplier-based margin system (×4.0 default), tap-to-toggle ×/% display |
| vinline.006 | Hybrid connection UI (connected: hover-reveal, unconnected: red dot + tap to connect) |
| vinline.007 | Live wine list price sync as margin slider is dragged |
| vinline.008 | Per-item BTG/BTB toggle in inventory edit controls; dripped from dev.002 |

### iterative/
Experimental builds for exploring new features. Reviewed and dripped into main when approved.

| Build | Description |
|-------|-------------|
| vinline.dev.001 | Base for iterative track — seeded from vinline.006 |
| vinline.dev.002 | BTG/BTB per-item toggle in edit controls; rebased to vinline.007 |

## Concept

**Input** `]` — email (Gmail / Outlook) scanned for distributor invoices  
**Inventory** `][` — parsed line items, margin-adjusted, reviewed before publishing  
**Output** `[` — wine list pushed to Google Drive / PDF

The collapsed logo state shows connection status at a glance. Red dot = needs setup. Green dot = live.

## Pricing logic
- Default bottle markup: **4× wholesale cost**  
- Glass price: **= wholesale cost**  
- Per-bottle overrides available via inline slider (range: ×1–×6)
