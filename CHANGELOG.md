# Changelog

## 0.4.0

### Added
- Tabs already open at install or update are identified automatically.
- 16 px toolbar icon for sharper rendering at 1x.
- Unit tests for the proxy address parser (`npm test`).

### Changed
- The proxy address is validated before it is stored; an invalid one is
  reported and never saved.
- The offscreen document is closed after it reports, and re-checked at every
  browser start.
- The action icon is refreshed when a tab finishes loading instead of on tab
  switch, which also covers back/forward cache restores.

### Fixed
- Concurrent tab reports could lose updates, share a rule id or register a
  container twice.
- The status page rendered tab titles and URLs as HTML.
- Messages from contexts other than the extension's own pages were accepted.
