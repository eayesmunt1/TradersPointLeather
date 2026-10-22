// The one switch for the on-site shop. While false, /shop, product pages and the
// cart are reachable only by direct URL: nothing on the public site links to
// them, and the cart button shows only on shop pages. See README.md for the
// static items (noindex tags, robots.txt, sitemap) to change when it goes true.
window.SHOP_PUBLIC = false;
// Local preview only: on localhost the shop shows as if it were public, so it can be
// browsed before release. The deployed site is not affected, and the sitemap function
// still reads the literal flag above.
if (['localhost', '127.0.0.1'].indexOf(location.hostname) > -1) window.SHOP_PUBLIC = true;
