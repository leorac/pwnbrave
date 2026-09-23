const SCHEMES = ["http", "https", "socks4", "socks5", "quic"];

export function parseProxy(text) {
  let s = String(text || "").trim();
  if (!s) return null;

  let scheme = "http";
  const m = s.match(/^([a-z0-9+.-]+):\/\/(.*)$/i);
  if (m) {
    scheme = m[1].toLowerCase();
    s = m[2];
  }
  if (!SCHEMES.includes(scheme)) throw new Error(`unsupported proxy scheme: ${scheme}`);

  s = s.replace(/\/.*$/, "");
  if (!s) return null;

  let host, port = 8080;
  const v6 = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (v6) {
    host = v6[1];
    if (v6[2]) port = Number(v6[2]);
  } else {
    const i = s.lastIndexOf(":");
    if (i > -1) {
      host = s.slice(0, i);
      port = Number(s.slice(i + 1));
    } else {
      host = s;
    }
  }
  if (!host) throw new Error("missing proxy host");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port: ${port}`);
  return { scheme, host, port };
}

export function formatProxy(p) {
  const host = p.host.includes(":") ? `[${p.host}]` : p.host;
  return `${p.scheme}://${host}:${p.port}`;
}

export function proxyValue(settings) {
  const proxy = parseProxy(settings.proxyTarget);
  if (!proxy) throw new Error("proxy not configured");
  return {
    mode: "fixed_servers",
    rules: { singleProxy: proxy, bypassList: settings.proxyLoopback ? ["<-loopback>"] : [] }
  };
}

const call = (fn, ...args) => new Promise((resolve, reject) => {
  fn.call(chrome.proxy.settings, ...args, result => {
    const err = chrome.runtime.lastError;
    if (err) reject(new Error(err.message));
    else resolve(result);
  });
});

export async function applyProxy(settings) {
  if (!settings.enabled || !settings.proxyEnabled) return clearProxy();
  await call(chrome.proxy.settings.set, { scope: "regular", value: proxyValue(settings) });
}

export async function clearProxy() {
  await call(chrome.proxy.settings.clear, { scope: "regular" });
}

export async function proxyStatus() {
  try {
    const s = await call(chrome.proxy.settings.get, {});
    return { mode: s?.value?.mode || "unknown", levelOfControl: s?.levelOfControl || "unknown" };
  } catch (e) {
    return { mode: "error", levelOfControl: "unknown", error: String(e.message || e) };
  }
}
