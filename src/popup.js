const $ = id => document.getElementById(id);

let state = null;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showError(message) {
  $("status").textContent = message || "";
}

async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (res?.error) throw new Error(res.error);
  return res;
}

async function act(msg) {
  try {
    state = await send(msg);
    render();
  } catch (e) {
    showError(e.message);
  }
}

const pill = text => el("span", { className: "pill plain", textContent: text });

function renderCurrent() {
  const c = state.current;
  const box = $("tab-state");
  box.replaceChildren();
  $("swatches").replaceChildren();

  if (!c) {
    $("tab-title").textContent = "no active tab";
    return;
  }
  $("tab-title").textContent = c.title;

  if (!state.defaultKnown) return box.append(pill("normal session not detected yet"));
  if (!c.identified && !c.injectable) return box.append(pill("browser page, no content script can run here"));
  if (!c.identified) {
    const identify = el("button", {
      className: "ghost",
      textContent: "Identify now",
      title: "Injects the beacon into this tab"
    });
    identify.addEventListener("click", async () => {
      try {
        await send({ kind: "identifyTab", tabId: c.tabId });
        setTimeout(() => act({ kind: "getState" }), 600);
      } catch (e) {
        showError(e.message);
      }
    });
    return box.append(pill("container not identified yet"), " ", identify);
  }
  if (c.isDefault || !c.container) return box.append(pill("normal session, traffic not tagged"));

  const entry = c.container;
  const tag = el("span", { className: "pill", textContent: `${entry.label} · ${entry.color}` });
  tag.style.borderColor = state.colorHex[entry.color];
  box.append(tag);

  for (const color of state.colors) {
    const swatch = el("button", {
      className: "swatch" + (color === entry.color ? " active" : ""),
      title: color
    });
    swatch.style.background = state.colorHex[color];
    swatch.addEventListener("click", () =>
      act({ kind: "setContainerColor", partitionId: entry.partitionId, color }));
    $("swatches").append(swatch);
  }
}

function renderContainers() {
  const list = $("container-list");
  list.replaceChildren();

  if (!state.containers.length) {
    list.append(el("li", {}, el("span", { className: "empty", textContent: "no container seen yet" })));
    $("registry-hint").textContent = "Open a tab in a Brave container: it will show up here with its own color.";
    return;
  }

  for (const entry of state.containers) {
    const dot = el("span", { className: "dot clickable", title: `${entry.color}, click for the next color` });
    dot.style.background = state.colorHex[entry.color];
    dot.addEventListener("click", () => act({ kind: "cycleColor", partitionId: entry.partitionId }));

    const input = el("input", {
      className: "label-input",
      value: entry.label,
      title: "Your own name: Brave does not expose the real container name"
    });
    input.addEventListener("change", () =>
      act({ kind: "setContainerLabel", partitionId: entry.partitionId, label: input.value.trim() || entry.label }));

    const count = el("span", {
      className: "count",
      textContent: entry.tabs ? `${entry.tabs} tab${entry.tabs > 1 ? "s" : ""}` : ""
    });

    const forget = el("button", { className: "forget", textContent: "×", title: "Forget this container" });
    forget.addEventListener("click", () => act({ kind: "forgetContainer", partitionId: entry.partitionId }));

    list.append(el("li", {}, dot, input, count, forget));
  }
  $("registry-hint").textContent = "Colors stay bound to the container across browser restarts.";
}

function proxySummary() {
  const s = state.settings;
  const p = state.proxy;
  if (!s.enabled || !s.proxyEnabled) return `off (browser mode: ${p.mode})`;
  if (p.mode === "fixed_servers") return `active: ${p.target ?? "not configured"}`;
  return `mode: ${p.mode}`;
}

function renderProxy() {
  const p = state.proxy;
  const parts = [proxySummary()];
  if (!p.levelOfControl.startsWith("controlled_by_this")) parts.push(`control: ${p.levelOfControl}`);
  if (p.error) parts.push(p.error);
  $("proxy-status").textContent = parts.join(" · ");
}

function render() {
  const s = state.settings;
  document.body.classList.toggle("off", !s.enabled);
  $("enabled").checked = s.enabled;
  $("proxy-enabled").checked = s.proxyEnabled;
  $("proxy-loopback").checked = s.proxyLoopback;
  if (document.activeElement !== $("proxy-target")) $("proxy-target").value = s.proxyTarget;

  renderCurrent();
  renderContainers();
  renderProxy();
  showError("");
}

const patch = p => act({ kind: "saveSettings", patch: p });

function debounced(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

$("enabled").addEventListener("change", e => patch({ enabled: e.target.checked }));
$("proxy-enabled").addEventListener("change", e => patch({ proxyEnabled: e.target.checked }));
$("proxy-loopback").addEventListener("change", e => patch({ proxyLoopback: e.target.checked }));

const saveTarget = () => {
  const value = $("proxy-target").value;
  if (state && value.trim() !== state.settings.proxyTarget) patch({ proxyTarget: value });
};
$("proxy-target").addEventListener("input", debounced(saveTarget, 800));
$("proxy-target").addEventListener("change", saveTarget);

$("open-status").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/status.html") });
  window.close();
});

act({ kind: "getState" });
