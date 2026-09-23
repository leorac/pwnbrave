import * as rules from "./rules.js";
import * as containers from "./containers.js";
import * as proxy from "./proxy.js";
import { paintIcon } from "./icon.js";
import { serial } from "./serial.js";

const DEFAULTS = {
  enabled: true,
  proxyEnabled: false,
  proxyTarget: "127.0.0.1:8080",
  proxyLoopback: false
};

const PROXY_KEYS = ["enabled", "proxyEnabled", "proxyTarget", "proxyLoopback"];
const DEFAULT_PARTITION_KEY = "defaultPartition";
const TAB_MAP_KEY = "tabPartitions";
const EXTENSION_ORIGIN = chrome.runtime.getURL("");
const OFFSCREEN_URL = chrome.runtime.getURL("src/offscreen.html");
const BEACON_URL = chrome.runtime.getURL("src/beacon.html");

const BLOCKED_PREFIXES = [
  "brave://", "chrome://", "chrome-extension://", "chrome-untrusted://", "devtools://",
  "edge://", "about:", "view-source:", "https://chromewebstore.google.com"
];

const canInject = url => !!url && !BLOCKED_PREFIXES.some(p => url.startsWith(p));

const getSettings = () => chrome.storage.local.get(DEFAULTS);

async function getDefaultPartition() {
  return (await chrome.storage.local.get(DEFAULT_PARTITION_KEY))[DEFAULT_PARTITION_KEY] || null;
}

async function getTabMap() {
  return (await chrome.storage.session.get(TAB_MAP_KEY))[TAB_MAP_KEY] || {};
}

async function updateTabMap(mutate) {
  const map = await getTabMap();
  mutate(map);
  await chrome.storage.session.set({ [TAB_MAP_KEY]: map });
}

async function openOffscreen() {
  const open = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (open.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["LOCAL_STORAGE"],
    justification: "Reads the default partition identifier to tell it apart from containers."
  }).catch(() => {});
}

const closeOffscreen = () => chrome.offscreen.closeDocument().catch(() => {});

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
}

async function injectIntoOpenTabs() {
  for (const tab of await chrome.tabs.query({})) {
    if (canInject(tab.url)) await injectContentScript(tab.id).catch(() => {});
  }
}

async function show(tabId, color, label, status) {
  await rules.setRule(tabId, color);
  await paintIcon(tabId, color, status);
  await chrome.tabs.sendMessage(tabId, { kind: "color", color, label }).catch(() => {});
}

async function applyToTab(tabId, partitionId, settings) {
  const s = settings || await getSettings();
  if (!s.enabled) return show(tabId, null, null, { enabled: false });

  const def = await getDefaultPartition();
  if (!def) return openOffscreen();
  if (partitionId === def) return show(tabId, null, null, { enabled: true, inContainer: false });

  const entry = await containers.ensure(partitionId);
  await show(tabId, entry.color, entry.label, { enabled: true, inContainer: true });
}

async function reapplyAll(settings) {
  const s = settings || await getSettings();
  for (const [tabId, partitionId] of Object.entries(await getTabMap())) {
    await applyToTab(Number(tabId), partitionId, s).catch(() => {});
  }
}

async function saveSettings(patch) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => k in DEFAULTS));
  if ("proxyTarget" in clean) {
    clean.proxyTarget = String(clean.proxyTarget).trim();
    if (!proxy.parseProxy(clean.proxyTarget)) throw new Error("enter a proxy address");
  }

  const before = await getSettings();
  const after = { ...before, ...clean };
  await chrome.storage.local.set(clean);

  if (before.enabled && !after.enabled) await rules.clearAll();
  if (PROXY_KEYS.some(k => before[k] !== after[k])) await proxy.applyProxy(after);
  await reapplyAll(after);
}

async function cycleColor(partitionId) {
  const def = await getDefaultPartition();
  if (!partitionId || partitionId === def) return;
  const entry = await containers.ensure(partitionId);
  await containers.setColor(partitionId, rules.nextColor(entry.color));
  await reapplyAll();
}

function describeProxy(settings) {
  try {
    const target = proxy.parseProxy(settings.proxyTarget);
    return { target: target ? proxy.formatProxy(target) : null };
  } catch (e) {
    return { target: null, error: String(e.message || e) };
  }
}

async function getState() {
  const settings = await getSettings();
  const registry = await containers.getRegistry();
  const map = await getTabMap();
  const def = await getDefaultPartition();
  const colored = new Map((await rules.listColored()).map(e => [e.tabId, e.color]));
  const status = await proxy.proxyStatus();
  const described = describeProxy(settings);

  const counts = {};
  const tabs = (await chrome.tabs.query({})).map(tab => {
    const partitionId = map[tab.id] || null;
    const isDefault = !!def && partitionId === def;
    const inContainer = !!partitionId && !isDefault;
    if (inContainer) counts[partitionId] = (counts[partitionId] || 0) + 1;
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || "",
      url: tab.url || "",
      injectable: canInject(tab.url),
      partitionId,
      identified: !!partitionId,
      isDefault,
      label: inContainer ? registry[partitionId]?.label || null : null,
      color: colored.get(tab.id) || null
    };
  });

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const current = active ? tabs.find(t => t.tabId === active.id) : null;

  return {
    settings,
    colors: rules.COLORS,
    colorHex: rules.COLOR_HEX,
    header: rules.HEADER,
    defaultKnown: !!def,
    defaultPartition: def,
    proxy: { ...status, ...described, error: status.error || described.error },
    current: current ? {
      ...current,
      title: current.title || current.url || `tab ${current.tabId}`,
      container: current.partitionId && !current.isDefault && registry[current.partitionId]
        ? { partitionId: current.partitionId, ...registry[current.partitionId] }
        : null
    } : null,
    containers: Object.entries(registry)
      .map(([partitionId, entry]) => ({ partitionId, ...entry, tabs: counts[partitionId] || 0 }))
      .sort((a, b) => rules.COLORS.indexOf(a.color) - rules.COLORS.indexOf(b.color)),
    tabs
  };
}

const handlers = {
  async defaultPartition(msg, sender) {
    if (sender.url !== OFFSCREEN_URL || !msg.id) return;
    await chrome.storage.local.set({ [DEFAULT_PARTITION_KEY]: msg.id });
    await closeOffscreen();
    await reapplyAll();
  },

  async partition(msg, sender) {
    const tabId = sender.tab?.id;
    if (!sender.url?.startsWith(BEACON_URL) || !tabId || !msg.id) return;
    await updateTabMap(map => { map[tabId] = msg.id; });
    await applyToTab(tabId, msg.id);
    await chrome.tabs.sendMessage(tabId, { kind: "beaconDone" }).catch(() => {});
  },

  async identifyTab(msg) {
    await injectContentScript(msg.tabId);
  },

  async setContainerColor(msg) {
    await containers.setColor(msg.partitionId, msg.color);
    await reapplyAll();
    return getState();
  },

  async cycleColor(msg) {
    await cycleColor(msg.partitionId);
    return getState();
  },

  async setContainerLabel(msg) {
    await containers.setLabel(msg.partitionId, msg.label);
    await reapplyAll();
    return getState();
  },

  async forgetContainer(msg) {
    await containers.forget(msg.partitionId);
    await reapplyAll();
    return getState();
  },

  async saveSettings(msg) {
    await saveSettings(msg.patch || {});
    return getState();
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(EXTENSION_ORIGIN)) return false;

  const run = msg?.kind === "getState"
    ? getState()
    : handlers[msg?.kind]
      ? serial(() => handlers[msg.kind](msg, sender))
      : Promise.reject(new Error(`unknown message: ${msg?.kind}`));

  run.then(
    result => sendResponse(result ?? { ok: true }),
    e => sendResponse({ error: String(e?.message || e) })
  );
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => serial(async () => {
  await rules.setRule(tabId, null);
  await updateTabMap(map => { delete map[tabId]; });
}).catch(() => {}));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  serial(async () => {
    const partitionId = (await getTabMap())[tabId];
    if (partitionId) await applyToTab(tabId, partitionId);
  }).catch(() => {});
});

chrome.commands.onCommand.addListener(command => serial(async () => {
  const settings = await getSettings();
  if (command === "toggle-enabled") return saveSettings({ enabled: !settings.enabled });
  if (command === "toggle-proxy") return saveSettings({ proxyEnabled: !settings.proxyEnabled });
  if (command === "cycle-color") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await cycleColor((await getTabMap())[tab.id]);
  }
}).catch(() => {}));

let booted = null;

function boot() {
  booted ??= serial(async () => {
    if (!await getDefaultPartition()) await openOffscreen();
    await rules.pruneStale();
    const settings = await getSettings();
    await proxy.applyProxy(settings).catch(() => {});
    await reapplyAll(settings);
  }).catch(() => {});
  return booted;
}

chrome.runtime.onStartup.addListener(async () => {
  await boot();
  await openOffscreen();
});

chrome.runtime.onInstalled.addListener(async () => {
  await boot();
  await openOffscreen();
  await injectIntoOpenTabs();
});

boot();
