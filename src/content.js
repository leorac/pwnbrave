(() => {
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("src/beacon.html");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "display:none!important;width:0;height:0;border:0;position:absolute;left:-9999px";

  const drop = () => frame.remove();

  const publish = (color, label) => {
    const root = document.documentElement;
    if (!root) return;
    if (color) {
      root.dataset.pwnbraveColor = color;
      if (label) root.dataset.pwnbraveContainer = label;
      else delete root.dataset.pwnbraveContainer;
    } else {
      delete root.dataset.pwnbraveColor;
      delete root.dataset.pwnbraveContainer;
    }
  };

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.kind === "beaconDone") drop();
    if (msg?.kind === "color") {
      publish(msg.color, msg.label);
      drop();
    }
  });
  setTimeout(drop, 5000);

  const attach = () => (document.body || document.documentElement).appendChild(frame);
  if (document.documentElement) attach();
  else document.addEventListener("readystatechange", attach, { once: true });
})();
