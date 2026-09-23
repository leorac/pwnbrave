export const HEADER = "X-PwnFox-Color";

export const COLORS = ["blue", "cyan", "green", "yellow", "orange", "red"];

export const COLOR_HEX = {
  blue: "#1e88e5",
  cyan: "#00acc1",
  green: "#43a047",
  yellow: "#fdd835",
  orange: "#fb8c00",
  red: "#e53935"
};

export const RESOURCE_TYPES = [
  "main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object",
  "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport",
  "webbundle", "other"
];

const RULE_MAP_KEY = "ruleIds";

async function getMap() {
  return (await chrome.storage.session.get(RULE_MAP_KEY))[RULE_MAP_KEY] || {};
}

async function putMap(map) {
  await chrome.storage.session.set({ [RULE_MAP_KEY]: map });
}

function allocate(map, tabId) {
  if (map[tabId]) return map[tabId];
  const used = new Set(Object.values(map));
  let id = 1;
  while (used.has(id)) id++;
  map[tabId] = id;
  return id;
}

export function buildRule(ruleId, tabId, color) {
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [{ header: HEADER, operation: "set", value: color }]
    },
    condition: { tabIds: [tabId], resourceTypes: RESOURCE_TYPES }
  };
}

function colorOf(rule) {
  return rule?.action?.requestHeaders?.[0]?.value || null;
}

export async function listColored() {
  const map = await getMap();
  const byId = new Map((await chrome.declarativeNetRequest.getSessionRules()).map(r => [r.id, r]));
  const out = [];
  for (const [tabId, ruleId] of Object.entries(map)) {
    const rule = byId.get(ruleId);
    if (rule) out.push({ tabId: Number(tabId), ruleId, color: colorOf(rule) });
  }
  return out;
}

export async function setRule(tabId, color) {
  const map = await getMap();

  if (!color) {
    const ruleId = map[tabId];
    if (!ruleId) return;
    delete map[tabId];
    await putMap(map);
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
    return;
  }

  const ruleId = allocate(map, tabId);
  const existing = (await chrome.declarativeNetRequest.getSessionRules()).find(r => r.id === ruleId);
  if (existing && colorOf(existing) === color) return;

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [buildRule(ruleId, tabId, color)]
  });
  await putMap(map);
}

export async function clearAll() {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  if (rules.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map(r => r.id) });
  }
  await putMap({});
}

export async function pruneStale() {
  const map = await getMap();
  const tabIds = Object.keys(map);
  if (!tabIds.length) return;

  const alive = new Set((await chrome.tabs.query({})).map(t => t.id));
  const remove = [];
  for (const tabId of tabIds) {
    if (!alive.has(Number(tabId))) {
      remove.push(map[tabId]);
      delete map[tabId];
    }
  }
  if (remove.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: remove });
    await putMap(map);
  }
}

export function nextColor(color) {
  return COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];
}
