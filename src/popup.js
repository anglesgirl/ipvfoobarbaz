/*
Copyright (C) 2011  Paul Marks  http://www.pmarks.net/
Copyright (C) 2024  ziad87      https://ziad87.net/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

"use strict";

const ALL_URLS = "<all_urls>";
const IS_MOBILE = /\bMobile\b/.test(navigator.userAgent);

// Partial code from ipvfoobar.
// -- hostnames & asn lookups --
window.dnsCache = {
  hosts: {},
  asns: {}
}

// Snip domains longer than this, to avoid horizontal scrolling.
const LONG_DOMAIN = 40; // Config option maybe?
function snipDomainName(domain){
  if (domain.length > LONG_DOMAIN) {
    return makeSnippedText(domain, Math.floor(LONG_DOMAIN / 2));
  } else {
    return document.createTextNode(domain);
  }
}

// helpers for buttons
const getDomain = host => {
  return psl.parse(host)?.domain;
}

function getWhois(domain) {
  // more tlds?
  if (domain.endsWith(".cz")) return "https://www.nic.cz/whois/domain/" + encodeURIComponent(getDomain(domain));
  return "https://who.is/whois/" + encodeURIComponent(getDomain(domain));
}

function addBtn(url, letter, title, utilsTd){
  const btn = document.createElement("a");
  btn.href = url;
  btn.textContent = letter;
  btn.target = "_blank";
  btn.className = "pbtn";
  btn.title = title;
  utilsTd.appendChild(btn);
}



const tabId = window.location.hash.substr(1);
if (!isFinite(Number(tabId))) {
  throw "Bad tabId";
}

let table = null;

window.onload = async function() {
  table = document.getElementById("addr_table");
  table.onmousedown = handleMouseDown;
  await beg();
  if (IS_MOBILE) {
    document.getElementById("mobile_footer").style.display = "flex";
  }
  setMode(getCurrentMode(options));
  connectToExtension();
};

async function beg() {
  const p = await chrome.permissions.getAll();
  for (const origin of p.origins) {
    if (origin == ALL_URLS) {
      return;  // We already have permission.
    }
  }
  const button = document.getElementById("beg");
  button.style.display = "block";  // visible
  button.addEventListener("click", async () => {
    // We need to close the popup before awaiting, otherwise
    // Firefox (at least version 116 on Windows) renders the
    // permission dialog underneath the popup.
    const promise = chrome.permissions.request({origins: [ALL_URLS]});
    window.close();
    await promise;
  });
}

function connectToExtension() {
  const port = chrome.runtime.connect(null, {name: tabId});
  port.onMessage.addListener((msg) => {
    document.bgColor = "";
    console.log("onMessage", msg.cmd, msg);
    switch (msg.cmd) {
      case "pushAll":
        return pushAll(msg.tuples, msg.pattern, msg.spillCount);
      case "pushOne":
        return pushOne(msg.tuple);
      case "pushPattern":
        return pushPattern(msg.pattern);
      case "pushSpillCount":
        return pushSpillCount(msg.spillCount);
      case "shake":
        return shake();
    }
  });

  port.onDisconnect.addListener(() => {
    document.bgColor = "lightpink";
    setTimeout(connectToExtension, 1);
  });
}

// Clear the table, and fill it with new data.
function pushAll(tuples, pattern, spillCount) {
  removeChildren(table);
  for (let i = 0; i < tuples.length; i++) {
    table.appendChild(makeRow(i == 0, tuples[i]));
  }
  pushPattern(pattern);
  pushSpillCount(spillCount);
}

// Insert or update a single table row.
function pushOne(tuple) {
  const domain = tuple[0];
  let insertHere = null;
  let isFirst = true;
  for (let tr = table.firstChild; tr; tr = tr.nextSibling) {
    if (tr._domain == domain) {
      // Found an exact match.  Update the row.
      minimalCopy(makeRow(isFirst, tuple), tr);
      return;
    }
    if (isFirst) {
      isFirst = false;
    } else if (tr._domain > domain) {
      insertHere = tr;
      break;
    }
  }
  // No exact match.  Insert the row in alphabetical order.
  table.insertBefore(makeRow(false, tuple), insertHere);
  if (IS_MOBILE) {
    zoomHack();
  } else {
    scrollbarHack();
  }
}

let lastPattern = "";
async function pushPattern(pattern) {
  if (!IS_MOBILE) {
    return;
  }
  if (lastPattern != pattern) {
    lastPattern = pattern;
  } else {
    return;
  }
  await spriteImgReady;
  for (const color of ["darkfg", "lightfg"]) {
    const canvas = document.getElementById(`pattern_icon_${color}`);
    const ctx = canvas.getContext("2d");
    const imageData = buildIcon(pattern, 32, color);
    ctx.putImageData(imageData, 0, 0);
  }
}

// Count must be a number.
function pushSpillCount(count) {
  document.getElementById("spill_count_container").style.display =
      count == 0 ? "none" : "block";
  removeChildren(document.getElementById("spill_count")).appendChild(
      document.createTextNode(count));
  if (IS_MOBILE) {
    zoomHack();
  } else {
    scrollbarHack();
  }
}

// Shake the content (for 500ms) to signal an error.
function shake() {
  document.body.className = "shake";
  setTimeout(function() {
    document.body.className = "";
  }, 600);
}

// On mobile, zoom in so the table fills the viewport.
function zoomHack() {
  const tableWidth = document.querySelector('table').offsetWidth;
  document.querySelector('meta[name="viewport"]').setAttribute('content', `width=${tableWidth}`);
}

// Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1395025
let redrawn = false;
function scrollbarHack() {
  if (typeof browser == "undefined") {
    return;  // nothing to do on Chrome.
  }
  setTimeout(() => {
    const e = document.documentElement;
    if (e.scrollHeight > e.clientHeight) {
      document.body.style.paddingRight = '20px';
    } else if (!redrawn) {
      document.body.classList.toggle('force-redraw');
      redrawn = true;
    }
  }, 200);
}

function removeChildren(n) {
  while (n.hasChildNodes()) {
    n.removeChild(n.lastChild);
  }
  return n;
}

// Copy the contents of src into dst, making minimal changes.
function minimalCopy(src, dst) {
  dst.className = src.className;
  for (let s = src.firstChild, d = dst.firstChild, sNext, dNext;
       s && d;
       s = sNext, d = dNext) {
    sNext = s.nextSibling;
    dNext = d.nextSibling;
    // First, sync up the class names.
    d.className = s.className = s.className;
    // Only replace the whole node if something changes.
    // That way, we avoid stomping on the user's selected text.
    if (!d.isEqualNode(s)) {
      dst.replaceChild(s, d);
    }
  }
}

function makeImg(src, title) {
  const img = document.createElement("img");
  img.src = src;
  img.title = title;
  return img;
}

function makeSslImg(flags) {
  switch (flags & (FLAG_SSL | FLAG_NOSSL)) {
    case FLAG_SSL | FLAG_NOSSL:
      return makeImg(
          "gray_schrodingers_lock.png",
          "HTTPS 与非 HTTPS 连接混合。");
    case FLAG_SSL:
      return makeImg(
          "gray_lock.png",
          "连接使用 HTTPS。\n" +
          "注意：IPvFoo 不验证加密的完整性。");
    default:
      return makeImg(
          "gray_unlock.png",
          "连接不使用 HTTPS。");
  }
}

function makeRow(isFirst, tuple) {
  const domain = tuple[0];
  const addr = tuple[1];
  const version = tuple[2];
  const flags = tuple[3];
  const proto = tuple[4] || "";  // Patched: nextHopProtocol from content.js.

  const tr = document.createElement("tr");
  if (isFirst) {
    tr.className = "mainRow";
  }

  // Build the SSL icon for the "zeroth" pseudo-column.
  const sslImg = makeSslImg(flags);
  sslImg.className = "sslImg";

  // Build the "Domain" column.
  const domainTd = document.createElement("td");
  domainTd.appendChild(sslImg);
  if (domain.length > LONG_DOMAIN) {
    domainTd.appendChild(makeSnippedText(domain, Math.floor(LONG_DOMAIN / 2)));
  } else {
    domainTd.appendChild(document.createTextNode(domain));
  }
  domainTd.className = "domainTd";
  domainTd.onclick = handleClick;
  domainTd.oncontextmenu = handleContextMenu;

  // Build the "Address" column.
  const addrTd = document.createElement("td");
  let addrClass = "";
  switch (version) {
    case "4": addrClass = " ip4"; break;
    case "6": addrClass = " ip6"; break;
  }
  const connectedClass = (flags & FLAG_CONNECTED) ? " highlight" : "";
  addrTd.className = `addrTd${addrClass}${connectedClass}`;
  addrTd.appendChild(document.createTextNode(addr));
  addrTd.onclick = handleClick;
  addrTd.oncontextmenu = handleContextMenu;

  let hostDiv = document.createElement("div");
  hostDiv.style.fontSize = "small";

  let originDiv = document.createElement("div");
  originDiv.style.fontSize = "small";

  const hostSpan = document.createElement("span");
  const originSpan = document.createElement("span");

  let ptr;
  let origin;
  if (addr.includes(".")) {
    let dnsName = addr.split(".").reverse().join(".");
    ptr = dnsName + ".in-addr.arpa";
    origin = dnsName + ".origin.asn.cymru.com";
  } else if (addr.includes(":")) {
    let dnsName = full_IPv6(addr).replaceAll(":", "").split("").reverse().join(".");
    ptr = dnsName + ".ip6.arpa";
    origin = dnsName + ".origin6.asn.cymru.com";
  } else {
    hostDiv = null;
  }

  if (ptr) {
    if (typeof window.dnsCache.hosts[ptr] === "undefined") {
      hostSpan.textContent = "解析中…";
      fetch("https://dns.google/resolve?name=" + ptr + "&type=PTR").then(res => res.json()).then(res => {
        hostSpan.textContent = '';
        let hasFoundHostname = false;
        if (res.Answer){
          for (let answer of res.Answer){
            if (answer.data && answer.type === 12) { // PTR
              window.dnsCache.hosts[ptr] = answer.data.slice(0, -1);
              hostSpan.appendChild(snipDomainName(window.dnsCache.hosts[ptr]));
              hasFoundHostname = true;
              break;
            }
          }
        }
        if (!hasFoundHostname){
          window.dnsCache.hosts[ptr] = false;
          hostDiv.remove();
          hostDiv = null;
        }
      });
    } else {
      hostSpan.textContent = '';
      if (window.dnsCache.hosts[ptr]) {
        hostSpan.appendChild(snipDomainName(window.dnsCache.hosts[ptr]));
      } else {
        hostDiv = null;
      }
    }
  } else {
    hostDiv = null;
  }

  if (origin) {
    if (typeof window.dnsCache.asns[origin] === "undefined") {
      originSpan.textContent = "获取中…";
      fetch("https://dns.google/resolve?name=" + origin + "&type=TXT").then(res => res.json()).then(async res => {
        if (res.Answer && res.Answer[0] && res.Answer[0].data) {
          window.dnsCache.asns[origin] = "AS" + res.Answer[0].data.split('|')[0].slice(0, -1);
          let res2 = await fetch("https://dns.google/resolve?name=" + window.dnsCache.asns[origin] + ".asn.cymru.com&type=TXT").then(res => res.json());
          if (res2.Answer && res2.Answer[0] && res2.Answer[0].data){
            let ans = res2.Answer[0].data.split(' |');
            window.dnsCache.asns[origin] = `AS${ans[0]} ${ans[4].split(' ')[1].split(',')[0]}, ${ans[1]}`;
            originSpan.textContent = window.dnsCache.asns[origin];
          }
        } else {
          window.dnsCache.asns[origin] = false;
          originDiv.remove();
          originDiv = null;
        }
      });
    } else {
      if (window.dnsCache.asns[origin]) {
        originSpan.textContent = window.dnsCache.asns[origin];
      } else {
        originDiv = null;
      }
    }
  } else {
    originDiv = null;
  }

  if (hostDiv) {
    hostSpan.onclick = handleClick;
    hostSpan.oncontextmenu = handleContextMenu;

    hostDiv.appendChild(document.createTextNode(" → "));
    hostDiv.appendChild(hostSpan);
  }

  if (originDiv) {
    originSpan.onclick = handleClick;
    originSpan.oncontextmenu = handleContextMenu;

    originDiv.appendChild(document.createTextNode(" → "));
    originDiv.appendChild(originSpan);
  }

  if (ptr && hostDiv) addrTd.appendChild(hostDiv);
  if (origin && originDiv) addrTd.appendChild(originDiv);

  // Build the "Protocol" column (patched): h3 runs over QUIC/UDP, every
  // other network protocol runs over TCP. Empty while unobserved.
  const protoTd = document.createElement("td");
  protoTd.className = "protoTd";
  if (proto == "h3") {
    protoTd.appendChild(document.createTextNode("UDP"));
    protoTd.title = "h3（QUIC，UDP）";
  } else if (proto) {
    protoTd.appendChild(document.createTextNode("TCP"));
    protoTd.title = `${proto}（TCP）`;
  }

  const utilsTd = document.createElement("td");

  // Perhaps these buttons should be icons? Or something else?
  addBtn(getWhois(domain), "W", "WHOIS", utilsTd);
  addBtn("https://search.arin.net/rdap/?query=" + encodeURIComponent(addr), "A", "ARIN", utilsTd);
  addBtn("https://apps.db.ripe.net/db-web-ui/query?searchtext=" + encodeURIComponent(addr), "R", "RIPE", utilsTd);
  addBtn("https://ipinfo.io/" + addr, "I", "IPInfo", utilsTd);
  addBtn("https://bgp.tools/prefix/" + addr, "B", "BGP.Tools", utilsTd);

  // Build the (possibly invisible) "WebSocket/Cached" column.
  // We don't need to worry about drawing both, because a cached WebSocket
  // would be nonsensical.
  //
  // Now that we also have a Service Worker icon, I just made it replace
  // the Cached icon because I'm too lazy to align multiple columns properly.
  const cacheTd = document.createElement("td");
  cacheTd.className = `cacheTd${connectedClass}`;
  if (flags & FLAG_WEBSOCKET) {
    cacheTd.appendChild(
        makeImg("websocket.png", "WebSocket 握手；连接可能仍在活动。"));
    cacheTd.style.paddingLeft = '6pt';
  } else if (!(flags & FLAG_NOTWORKER)) {
    cacheTd.appendChild(
        makeImg("serviceworker.png", "Service Worker 请求；可能来自其他标签页。"));
    cacheTd.style.paddingLeft = '6pt';
  } else if (!(flags & FLAG_UNCACHED)) {
    cacheTd.appendChild(
        makeImg("cached_arrow.png", "仅来自缓存请求的数据。"));
    cacheTd.style.paddingLeft = '6pt';
  } else {
    cacheTd.style.paddingLeft = '0';
  }

  tr._domain = domain;
  tr.appendChild(domainTd);
  tr.appendChild(addrTd);
  tr.appendChild(protoTd);
  tr.appendChild(cacheTd);
  tr.appendChild(utilsTd);
  return tr;
}

// Given a long domain name, generate "prefix...suffix".  When the user
// clicks "...", all domains are expanded.  The CSS is tricky because
// we want the original domain to remain intact for clipboard purposes.
function makeSnippedText(domain, keep) {
  const prefix = domain.substr(0, keep);
  const snipped = domain.substr(keep, domain.length - 2 * keep);
  const suffix = domain.substr(domain.length - keep);
  const f = document.createDocumentFragment();

  // Add prefix text.
  f.appendChild(document.createTextNode(prefix));

  // Add snipped text, invisible but copyable.
  let snippedText = document.createElement("span");
  snippedText.className = "snippedTextInvisible";
  snippedText.textContent = snipped;
  f.appendChild(snippedText);

  // Add clickable "..." image.
  const snipImg = makeImg("snip.png", "");
  snipImg.className = "snipImg";
  const snipLink = document.createElement("a");
  snipLink.className = "snipLinkInvisible snipLinkVisible";
  snipLink.href = "#";
  snipLink.addEventListener("click", unsnipAll);
  snipLink.appendChild(snipImg);
  f.appendChild(snipLink);

  // Add suffix text.
  f.appendChild(document.createTextNode(suffix));
  return f;
}

function unsnipAll(event) {
  event.preventDefault();
  removeStyles(".snippedTextInvisible", ".snipLinkVisible");
}

function removeStyles(...selectors) {
  const stylesheet = document.styleSheets[0];
  for (const selector of selectors) {
    for (let i = stylesheet.cssRules.length - 1; i >= 0; i--) {
      const rule = stylesheet.cssRules[i];
      if (rule.selectorText === selector) {
        stylesheet.deleteRule(i);
      }
    }
  }
}

// Mac OS has an annoying feature where right-click selects the current
// "word" (i.e. a useless fragment of the address) before showing a
// context menu.  Detect this by watching for the selection to change
// between consecutive onmousedown and oncontextmenu events.
let oldTimeStamp = 0;
let oldRanges = [];
function handleMouseDown(e) {
  oldTimeStamp = e.timeStamp;
  oldRanges = [];
  const sel = window.getSelection();
  for (let i = 0; i < sel.rangeCount; i++) {
    oldRanges.push(sel.getRangeAt(i));
  }
}

function isSpuriousSelection(sel, newTimeStamp) {
  if (newTimeStamp - oldTimeStamp > 10) {
    return false;
  }
  if (sel.rangeCount != oldRanges.length) {
    return true;
  }
  for (let i = 0; i < sel.rangeCount; i++) {
    const r1 = sel.getRangeAt(i);
    const r2 = oldRanges[i];
    if (r1.compareBoundaryPoints(Range.START_TO_START, r2) != 0 ||
        r1.compareBoundaryPoints(Range.END_TO_END, r2) != 0) {
      return true;
    }
  }
  return false;
}

function handleContextMenu(e) {
  const sel = window.getSelection();
  if (isSpuriousSelection(sel, e.timeStamp)) {
    sel.removeAllRanges();
  }
  selectWholeAddress(this, sel);
  return sel;
}

function handleClick() {
  selectWholeAddress(this, window.getSelection());
}

// If the user hasn't manually selected part of the address, then select
// the whole thing, to make copying easier.
function selectWholeAddress(node, sel) {
  if (sel.isCollapsed || !sel.containsNode(node, true)) {
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// dark mode
const prefersDark = () => window?.matchMedia?.('(prefers-color-scheme:dark)')?.matches ?? false;
function getCurrentMode(opts = options){
  let darkMode = false;
  switch (opts.popupColorScheme){
    case 'light':
      darkMode = false;
      break;
    case 'dark':
      darkMode = true;
      break;
    case 'system':
    default:
      darkMode = prefersDark();
  }
  return darkMode;
}
function setMode(dark){
  if (document.body){
    if (dark) document.body.classList.add('dark')
    else document.body.classList.remove('dark');
  }
}
watchOptions(function(optionsChanged) {
  if (optionsChanged.includes('popupColorScheme')){
    setMode(getCurrentMode(options));
  }
});

function full_IPv6(ip_string) {
  // replace ipv4 address if any
  var ipv4 = ip_string.match(/(.*:)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$)/);
  if (ipv4) {
    var ip_string = ipv4[1];
    ipv4 = ipv4[2].match(/[0-9]+/g);
    for (var i = 0; i < 4; i++) {
      var byte = parseInt(ipv4[i], 10);
      ipv4[i] = ("0" + byte.toString(16)).substr(-2);
    }
    ip_string += ipv4[0] + ipv4[1] + ':' + ipv4[2] + ipv4[3];
  }

  // take care of leading and trailing ::
  ip_string = ip_string.replace(/^:|:$/g, '');

  var ipv6 = ip_string.split(':');

  for (var i = 0; i < ipv6.length; i++) {
    var hex = ipv6[i];
    if (hex != "") {
      // normalize leading zeros
      ipv6[i] = ("0000" + hex).substr(-4);
    }
    else {
      // normalize grouped zeros ::
      hex = [];
      for (var j = ipv6.length; j <= 8; j++) {
        hex.push('0000');
      }
      ipv6[i] = hex.join(':');
    }
  }

  return ipv6.join(':');
}