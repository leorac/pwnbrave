import { COLORS } from "./rules.js";

const KEY = "containers";

export async function getRegistry() {
  return (await chrome.storage.local.get(KEY))[KEY] || {};
}

async function save(registry) {
  await chrome.storage.local.set({ [KEY]: registry });
}

function firstFreeColor(registry) {
  const used = new Set(Object.values(registry).map(c => c.color));
  return COLORS.find(c => !used.has(c)) || COLORS[Object.keys(registry).length % COLORS.length];
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

export async function ensure(partitionId) {
  const registry = await getRegistry();
  if (!registry[partitionId]) {
    const color = firstFreeColor(registry);
    registry[partitionId] = { color, label: capitalize(color), firstSeen: Date.now() };
    await save(registry);
  }
  return registry[partitionId];
}

async function update(partitionId, patch) {
  const registry = await getRegistry();
  if (!registry[partitionId]) return null;
  Object.assign(registry[partitionId], patch);
  await save(registry);
  return registry[partitionId];
}

export function setColor(partitionId, color) {
  if (!COLORS.includes(color)) throw new Error(`unknown color: ${color}`);
  return update(partitionId, { color });
}

export function setLabel(partitionId, label) {
  const clean = String(label || "").trim().slice(0, 40);
  if (!clean) throw new Error("empty label");
  return update(partitionId, { label: clean });
}

export async function forget(partitionId) {
  const registry = await getRegistry();
  delete registry[partitionId];
  await save(registry);
}
