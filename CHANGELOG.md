# Changelog

## 0.4.0

Initial public release.

- One color per Brave container, sent as `X-PwnFox-Color` so the PwnFox Burp
  extension highlights requests per identity. Traffic outside containers is
  never tagged.
- Colors `blue`, `cyan`, `green`, `yellow`, `orange`, `red`, picked
  automatically and editable from the popup, bound to the container across
  browser restarts.
- Profile-wide proxy switch, with an option to route localhost and 127.0.0.1 too.
- Toolbar icon with a dot in the container's color.
- Keyboard shortcuts for the next color, PwnBrave on/off and proxy on/off.
- Container color exposed on the page root, so browser automation agents such as
  Claude in Chrome can tell which container a tab is in.
- Tabs already open at install are picked up automatically.
