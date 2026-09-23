const $ = id => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const muted = text => el("span", { className: "muted", textContent: text });
const pill = text => el("span", { className: "pill", textContent: text });

function swatch(color, hex) {
  if (!color) return muted("none");
  const dot = el("span", { className: "dot" });
  dot.style.background = hex[color] || "#888";
  return el("span", {}, dot, color);
}

function table(node, columns, rows, empty) {
  const head = el("tr", {}, ...columns.map(c => el("th", { textContent: c })));
  const body = rows.map(cells => el("tr", {}, ...cells.map(([content, cls]) =>
    el("td", { className: cls || "" }, content))));
  if (!rows.length) body.push(el("tr", {}, el("td", { colSpan: columns.length }, muted(empty))));
  node.replaceChildren(head, ...body);
}

function tabPlace(t) {
  if (t.color) return { label: null, plain: `color=${t.color} container=${t.label}` };
  if (t.isDefault) return { label: "normal session", plain: "color=none normal-session" };
  if (!t.injectable) return { label: "browser page", plain: "color=none browser-page" };
  return { label: "not identified", plain: "color=none not-identified" };
}

function proxyText(state) {
  if (!state.settings.enabled || !state.settings.proxyEnabled) return "off";
  return state.proxy.target || "not configured";
}

function render(state) {
  const hex = state.colorHex;
  const proxy = proxyText(state);

  $("summary").replaceChildren(
    pill(state.settings.enabled ? "enabled" : "disabled"), " ",
    pill(`header ${state.header}`), " ",
    pill(`proxy ${proxy}`), " ",
    pill(state.defaultKnown ? "normal session identified" : "normal session unknown")
  );

  table($("containers"), ["Color", "Label", "Partition id", "Open tabs"],
    state.containers.map(c => [
      [swatch(c.color, hex)],
      [c.label || ""],
      [c.partitionId, "mono"],
      [String(c.tabs)]
    ]),
    "no container seen yet");

  table($("tabs"), ["tabId", "Color", "Container", "Window", "Title", "URL"],
    state.tabs.map(t => {
      const place = tabPlace(t);
      return [
        [String(t.tabId), "mono"],
        [place.label ? muted(place.label) : swatch(t.color, hex)],
        [t.label || ""],
        [String(t.windowId), "mono"],
        [t.title],
        [el("div", { className: "url mono", textContent: t.url, title: t.url })]
      ];
    }),
    "no tabs");

  const lines = [
    `enabled=${state.settings.enabled} header=${state.header} proxy=${proxy}`,
    "",
    "CONTAINERS",
    ...(state.containers.length
      ? state.containers.map(c => `  color=${c.color} label=${c.label} partition=${c.partitionId} tabs=${c.tabs}`)
      : ["  (none)"]),
    "",
    "TABS",
    ...state.tabs.map(t => `  tabId=${t.tabId} ${tabPlace(t).plain} url=${t.url}`)
  ];
  $("plain").textContent = lines.join("\n");
}

async function load() {
  try {
    const state = await chrome.runtime.sendMessage({ kind: "getState" });
    if (state?.error) throw new Error(state.error);
    render(state);
  } catch (e) {
    $("summary").textContent = `error: ${e.message}`;
  }
}

load();
setInterval(load, 2000);
