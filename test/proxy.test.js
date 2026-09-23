import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProxy, formatProxy, proxyValue } from "../src/proxy.js";

test("host and port default to http and 8080", () => {
  assert.deepEqual(parseProxy("127.0.0.1:8081"), { scheme: "http", host: "127.0.0.1", port: 8081 });
  assert.deepEqual(parseProxy("burp.local"), { scheme: "http", host: "burp.local", port: 8080 });
});

test("scheme, IPv6 and trailing paths are handled", () => {
  assert.deepEqual(parseProxy("socks5://10.0.0.1:1080/"), { scheme: "socks5", host: "10.0.0.1", port: 1080 });
  assert.deepEqual(parseProxy("https://[::1]:8443"), { scheme: "https", host: "::1", port: 8443 });
  assert.equal(formatProxy(parseProxy("https://[::1]:8443")), "https://[::1]:8443");
});

test("empty input means not configured", () => {
  assert.equal(parseProxy("   "), null);
});

test("invalid input is rejected", () => {
  assert.throws(() => parseProxy("ftp://x:1"), /unsupported proxy scheme/);
  assert.throws(() => parseProxy("host:99999"), /invalid port/);
  assert.throws(() => parseProxy(":8080"), /missing proxy host/);
});

test("fixed_servers with the optional loopback override", () => {
  const settings = { proxyTarget: "127.0.0.1:8080", proxyLoopback: true };
  assert.deepEqual(proxyValue(settings), {
    mode: "fixed_servers",
    rules: { singleProxy: { scheme: "http", host: "127.0.0.1", port: 8080 }, bypassList: ["<-loopback>"] }
  });
  assert.deepEqual(proxyValue({ ...settings, proxyLoopback: false }).rules.bypassList, []);
});
