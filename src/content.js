/*
Patch (not upstream): passively report each resource's transport protocol.

The page itself already records, for every resource it loads, the
negotiated protocol in Resource Timing (nextHopProtocol): "h3" means
QUIC over UDP, "h2" / "http/1.1" / "http/1.0" mean TCP. This script only
reads that existing record and forwards hostname -> protocol to the
background script, which shows it as a TCP / UDP column in the popup.
No new connection is made, no extra traffic is generated.

Entries with an empty nextHopProtocol (e.g. cache hits) are skipped, so
they never overwrite a protocol that was already observed.
*/

"use strict";

function collect(entries) {
  const out = {};
  for (const e of entries) {
    const nhp = e.nextHopProtocol;
    if (!nhp) {
      continue;
    }
    let host = "";
    try {
      host = new URL(e.name).hostname;
    } catch (_) {
      continue;
    }
    if (host) {
      out[host] = nhp;
    }
  }
  if (Object.keys(out).length) {
    chrome.runtime.sendMessage({ cmd: "proto", entries: out });
  }
}

// Main document protocol (navigation entries are not covered by the
// "resource" observer below).
collect(performance.getEntriesByType("navigation"));

// Resources loaded later (e.g. video segments) stream in here.
// buffered:true also replays entries that already exist, so a one-shot
// resource scan is unnecessary when the observer is available.
try {
  const obs = new PerformanceObserver((list) => {
    collect(list.getEntries());
  });
  obs.observe({ type: "resource", buffered: true });
} catch (_) {
  collect(performance.getEntriesByType("resource"));
}
