// The one switch for the on-site shop. True: the header Shop link and the shop buttons on the
// home page show and point at /shop, and /shop and the product pages are listed in the sitemap.
// False (a quick rollback): the home page links fall back to Etsy, the Shop link hides, and the
// sitemap drops the shop. See README.md. The shop pages themselves carry no noindex tag; the
// cart and order pages always do.
window.SHOP_PUBLIC = true;
