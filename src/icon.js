import { COLOR_HEX } from "./rules.js";

const SIZES = [16, 32];
const cache = new Map();
let headPromise = null;

function head() {
  headPromise ??= fetch(chrome.runtime.getURL("icons/icon128.png"))
    .then(r => r.blob())
    .then(createImageBitmap)
    .catch(e => { headPromise = null; throw e; });
  return headPromise;
}

async function draw(size, color, dim) {
  const key = `${size}:${color || "none"}:${dim ? "dim" : "on"}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const k = size / 32;

  ctx.globalAlpha = dim ? 0.35 : 1;
  ctx.drawImage(await head(), 0, 0, size, size);
  ctx.globalAlpha = 1;

  if (color) {
    ctx.beginPath();
    ctx.arc(23.5 * k, 23.5 * k, 8 * k, 0, Math.PI * 2);
    ctx.fillStyle = "#14161a";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(23.5 * k, 23.5 * k, 6 * k, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_HEX[color] || "#888";
    ctx.fill();
  }

  const data = ctx.getImageData(0, 0, size, size);
  cache.set(key, data);
  return data;
}

function titleFor(color, enabled, inContainer) {
  if (!enabled) return "PwnBrave: off";
  if (color) return `PwnBrave: container tagged ${color}`;
  if (inContainer === false) return "PwnBrave: normal session, traffic not tagged";
  return "PwnBrave: container not identified yet";
}

async function paint(tabId, color, enabled, inContainer) {
  const imageData = {};
  for (const size of SIZES) imageData[size] = await draw(size, enabled ? color : null, !enabled);
  await chrome.action.setIcon({ tabId, imageData });
  await chrome.action.setTitle({ tabId, title: titleFor(color, enabled, inContainer) });
}

export function paintIcon(tabId, color, { enabled = true, inContainer = null } = {}) {
  return paint(tabId, color, enabled, inContainer).catch(() => {});
}
