// vinline — persistent app state: wine list, inventory, settings
// DOM stays the source of truth while the app runs; state is a serialized
// snapshot written after every mutation and rehydrated on load.
const STATE_KEY = 'vinline_app_state_v1';

function defaultState() {
  return {
    schemaVersion: 1,
    inventory: [],   // [{ name, size, region, qty, category, cost, mult, btg, parsedAt, onList }]
    wineList: [],    // [{ category, items: [{ name, sub, region, size, price, cost, invIdx }] }]
    settings: {
      autoScan: false,
      autoSync: false,
      marginPresets: { red: 4.0, white: 4.0, sparkling: 4.0, other: 4.0 }
    },
    savedAt: null
  };
}

let appState = defaultState();

export function loadAppState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = defaultState();
      appState = {
        ...base, ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}),
          marginPresets: { ...base.settings.marginPresets, ...((parsed.settings || {}).marginPresets || {}) } }
      };
    }
  } catch (e) {
    appState = defaultState();
  }
  return appState;
}

export function getState() { return appState; }

export function saveAppState() {
  try {
    appState.savedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(appState));
    return true;
  } catch (e) {
    return false; // quota exceeded or storage unavailable — app keeps working, just unpersisted
  }
}

export function clearAppState() {
  appState = defaultState();
  try { localStorage.removeItem(STATE_KEY); } catch (e) { /* ignore */ }
}
