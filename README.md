**IPvFooBarBaz** is a Chrome/Firefox extension that adds an icon to indicate whether the current page was fetched using IPv4 or IPv6. When you click the icon, a pop-up appears, listing the IP address for each domain that served the page elements, as well as their hostname and ASN (if available).

Everything is captured privately using the webRequest API, however Google DNS is used to fetch hostnames, as well as Cymru's IP to ASN services.

This is a fork of the original IPvFoo, and uses code from the IPvFooBar (which itself is a fork of IPvFoo).

## Screenshot
![Screenshot](/misc/screenshot_webstore_1_640x400.png?raw=true)

## Add to Chrome
https://chromewebstore.google.com/detail/ipvfoobarbaz/jiaodmfhmjdhefmljkipedcbpkplpfcn

## Add to Firefox
https://addons.mozilla.org/firefox/addon/ipvfoobarbaz

## Add to Edge
Coming Soon
*(You can also run the [Chrome version](https://chromewebstore.google.com/detail/ipvfoobarbaz/jiaodmfhmjdhefmljkipedcbpkplpfcn) on Edge, as they are identical.)*

## Safari?

IPvFoo cannot be [ported to Safari](https://github.com/pmarks-net/ipvfoo/issues/39) because the `webRequest` API does not report IP addresses.  In theory, a Safari extension could do its own DNS lookups over HTTPS, but such behavior is beyond the scope of IPvFoo.

---

## 汉化 + 协议列补丁（本 fork）

本分支基于官方 IPvFooBarBaz，在原版基础上增加：界面汉化；弹窗新增 TCP / UDP 协议列（被动读取页面 Resource Timing 的 nextHopProtocol：h3 为 UDP/QUIC，其余为 TCP，零新增连接）。
