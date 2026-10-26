/* Cart and shop pages. Vanilla, no framework. The cart holds only
   {slug, qty, options, initials}: prices are never stored here, they come from
   /api/catalog on every load, and /api/checkout looks them up again. */
(function () {
  'use strict';

  var KEY = 'tpl-cart-v1';
  // Matches shipLine() in product-html.js: 1-2 weeks and final sale unless every piece is Ready to Ship (section=ready).
  function shipText(ready) {
    return 'Free shipping (US). ' + (ready ? 'Ships in 1\u20133 business days.' : 'Ships in 1\u20132 weeks.') +
      (ready ? ' Delivery takes 5\u20137 days in the lower 48. 14-day returns if undamaged and without initials; buyer pays return shipping.' : ' Delivery takes 5\u20137 days in the lower 48. Made for you, so final sale unless it arrives defective or damaged.');
  }
  var memory = null; // used when localStorage is unavailable
  var catalog = null;
  var manifest = {}; // /img/manifest.json: local photos per slug, [{src, color?}]
  var notice = '';

  /* ── storage ── */
  function readCart() {
    if (memory) return memory;
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(v)) return v.filter(function (i) { return i && typeof i.slug === 'string' && i.qty > 0; });
    } catch (e) {}
    return [];
  }
  function writeCart(items) {
    memory = items;
    try { localStorage.setItem(KEY, JSON.stringify(items)); memory = null; } catch (e) {}
    renderAll();
  }
  function lineKey(i) { return [i.slug, JSON.stringify(i.options || {}), i.initials || ''].join('|'); }

  /* ── helpers ── */
  function money(cents) { return '$' + (cents / 100).toFixed(2).replace(/\.00$/, ''); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function product(slug) {
    if (!catalog) return null;
    for (var i = 0; i < catalog.products.length; i++) if (catalog.products[i].slug === slug) return catalog.products[i];
    return null;
  }
  // ?drafts=1 previews products still flagged needs_review; the server leaves them out otherwise.
  var DRAFTS = new URLSearchParams(location.search).get('drafts') === '1';
  if (DRAFTS) {
    var noindex = document.createElement('meta');
    noindex.name = 'robots'; noindex.content = 'noindex, nofollow';
    document.head.append(noindex);
  }
  function visible(p) { return true; }
  function maxQty(p) { return p.section === 'made' ? 1 : p.soldOut ? 0 : p.stock !== null ? Math.min(p.stock, 10) : p.oneOfAKind ? 1 : 10; }
  function optionText(i) {
    var o = i.options || {}, parts = [];
    ['color', 'thread', 'size', 'snap'].forEach(function (k) { if (o[k]) parts.push(k[0].toUpperCase() + k.slice(1) + ': ' + o[k]); });
    if (o.sizeText) parts.push((o.sizeLabel || 'Size') + ': ' + o.sizeText);
    if (i.initials) parts.push('Initials: ' + i.initials);
    return parts.join(' · ');
  }

  /* ── catalog ── */
  var catalogPromise = Promise.all([
    fetch('/api/catalog' + (DRAFTS ? '?drafts=1' : '')).then(function (r) { if (!r.ok) throw new Error('catalog'); return r.json(); }),
    fetch('/img/manifest.json').then(function (r) { return r.json(); }).catch(function () { return {}; }),
  ]).then(function (res) { catalog = res[0]; manifest = res[1]; prune(); return catalog; });

  // Our own photos first, then whatever Stripe holds for the product.
  function photos(p) {
    var all = manifest[p.slug] || p.images.map(function (src) { return { src: src }; });
    // A page with a fixed colour shows that colour's photos when there are any.
    var mine = p.build && p.build.color ? all.filter(function (ph) { return ph.color === p.build.color; }) : [];
    return mine.length ? mine : all;
  }

  // Drop anything sold out or removed since it was added, and say so.
  function prune() {
    var items = readCart(), kept = [], dropped = 0;
    items.forEach(function (i) {
      var p = product(i.slug);
      if (!p || !visible(p)) { dropped++; return; }
      i.qty = Math.min(i.qty, maxQty(p));
      kept.push(i);
    });
    if (dropped) notice = dropped === 1 ? 'An item in your cart sold out and was removed.' : dropped + ' items in your cart sold out and were removed.';
    if (kept.length !== items.length || dropped) writeCart(kept); else renderAll();
  }

  /* ── cart actions ── */
  function add(item) {
    var items = readCart(), k = lineKey(item), found = false;
    var p = product(item.slug), cap = p ? maxQty(p) : 10;
    items.forEach(function (i) { if (lineKey(i) === k) { i.qty = Math.min(i.qty + item.qty, cap); found = true; } });
    if (!found) items.push(item);
    notice = '';
    writeCart(items);
    openDrawer();
  }
  function setQty(index, qty) {
    var items = readCart();
    if (qty < 1) items.splice(index, 1); else items[index].qty = qty;
    notice = '';
    writeCart(items);
  }
  function count() { return readCart().reduce(function (n, i) { return n + i.qty; }, 0); }

  /* ── rendering ── */
  // Belts and the dog collar share a page: both are cut to a length or size after the order.
  function isStrap(p) { return p.type === 'belt' || p.type === 'collar'; }
  // The three pages under /shop. Belts are made to order too, but have a page of their own.
  var CATS = [
    { slug: 'ready-to-ship', title: 'Ready to Ship', lede: 'Finished pieces that leave in 1\u20133 business days.',
      has: function (p) { return p.section === 'ready' && !p.soldOut && !isStrap(p); }, empty: 'Nothing is ready to ship right now. Everything on the Made to Order page is built for you.' },
    { slug: 'made-to-order', title: 'Made to Order', lede: 'Built after you order, and shipped in 1\u20132 weeks.',
      has: function (p) { return p.section === 'made' && !isStrap(p); }, empty: 'Nothing here right now.' },
    { slug: 'belts', title: 'Belts and Dog Collars', lede: 'Made to your length or size after you order, and shipped in 1\u20132 weeks.',
      has: isStrap, empty: 'Nothing here right now.' },
  ];

  // Square card images cropped from the owner's originals, where the first gallery photo crops badly.
  var TILES = ['gv1-horween-cypress', 'cygnus-shell-cordovan-marbled', 'cygnus-shell-cordovan-inverse-marbled', 'belt-newbury-latigo-burgundy', 'belt-horween-cxl-raven'];
  // "Model in Leather - Color" reads as Model \u00b7 Color over the leather, so the color is never cut off.
  // When the part after " - " is a product type, not a color, lead with the build color and put the type under the leather.
  function cardName(p) {
    var m = /^(.+?) in (.+?)(?: - (.+))?$/.exec(p.name || '');
    if (!m) return { title: p.name, sub: '' };
    if (m[3] && p.build && p.build.color && /wallet|sleeve|bifold|belt|collar/i.test(m[3])) {
      return { title: m[1] + ' \u00b7 ' + p.build.color, sub: m[2] + ' \u00b7 ' + m[3].charAt(0) + m[3].slice(1).toLowerCase() };
    }
    return { title: m[3] ? m[1] + ' \u00b7 ' + m[3] : m[1], sub: m[2] };
  }
  // A tile for a whole category, on the /shop landing page.
  function tile(c, items) {
    // Lead with a wallet where there is one, so a section is introduced by a wallet when it has any.
    var lead = items.filter(function (p) { return p.type === 'wallet'; })[0] || items[0];
    var ph = lead ? photos(lead)[0] : null;
    return el('li', {}, [el('a', { class: 'card', href: '/shop/' + c.slug + (DRAFTS ? '?drafts=1' : '') }, [
      el('div', { class: 'card-img' }, [ph ? el('img', { src: ph.src, alt: '', loading: 'lazy' }) : el('span', { text: 'Coming soon' })]),
      el('div', { class: 'card-body' }, [
        el('h2', { text: c.title }),
        el('p', { class: 'leather', text: c.lede }),
        el('div', { class: 'price', text: items.length + (items.length === 1 ? ' piece' : ' pieces') }),
      ]),
    ])]);
  }


  function lineTotal(i, p) { return (p.amount + (i.initials && catalog.monogram ? catalog.monogram.amount : 0)) * i.qty; }

  function renderCartInto(box, onCheckout) {
    box.replaceChildren();
    var items = readCart();
    if (notice) box.append(el('p', { class: 'notice', role: 'status', text: notice }));
    if (!catalog) { box.append(el('p', { class: 'cart-empty', text: 'Loading your cart…' })); return; }
    if (!items.length) {
      box.append(el('p', { class: 'cart-empty', text: 'Your cart is empty.' }), el('a', { class: 'btn btn-shop', href: '/shop', text: 'Shop' }));
      // The full page also shows the three shop sections; the drawer stays short.
      if (box.id === 'cart-page') {
        var all = catalog.products.filter(function (q) { return q.slug !== 'monogram'; });
        box.append(el('ul', { class: 'grid tiles cart-tiles' }, CATS.map(function (k) { return tile(k, all.filter(k.has)); })));
      }
      return;
    }
    var ul = el('ul', { class: 'cart-lines' }), subtotal = 0;
    items.forEach(function (i, idx) {
      var p = product(i.slug); if (!p) return;
      var total = lineTotal(i, p); subtotal += total;
      // Prefer a photo in the colour the buyer chose.
      var ph = photos(p), color = (i.options || {}).color;
      var pick = ph.filter(function (x) { return x.color && x.color === color; })[0] || ph[0];
      var thumb = pick ? el('img', { src: pick.src, alt: '', width: '72', height: '72' }) : el('div', { class: 'ph' });
      var minus = el('button', { type: 'button', 'aria-label': 'Decrease quantity of ' + p.name, text: '−' });
      var plus = el('button', { type: 'button', 'aria-label': 'Increase quantity of ' + p.name, text: '+' });
      if (i.qty >= maxQty(p)) plus.disabled = true;
      minus.addEventListener('click', function () { setQty(idx, i.qty - 1); });
      plus.addEventListener('click', function () { setQty(idx, i.qty + 1); });
      var remove = el('button', { type: 'button', class: 'link-btn', 'aria-label': 'Remove ' + p.name + ' from cart', text: 'Remove' });
      remove.addEventListener('click', function () { setQty(idx, 0); });
      ul.append(el('li', { class: 'cart-line' }, [
        thumb,
        el('div', {}, [
          el('h3', { text: cardName(p).title }),
          cardName(p).sub ? el('div', { class: 'leather', text: cardName(p).sub }) : null,
          el('div', { class: 'opts', text: optionText(i) }),
          el('div', { class: 'qty' }, [minus, el('output', { 'aria-label': 'Quantity', text: String(i.qty) }), plus, remove]),
        ]),
        el('div', { class: 'line-total price', text: money(total) }),
      ]));
    });
    var btn = el('button', { type: 'button', class: 'btn', text: 'Checkout' });
    var err = el('p', { class: 'error', role: 'alert' });
    btn.addEventListener('click', function () { checkout(btn, err); });
    box.append(ul, el('div', { class: 'cart-summary' }, [
      el('div', { class: 'row subtotal' }, [el('span', { text: 'Subtotal' }), el('span', { text: money(subtotal) })]),
      el('div', { class: 'row muted' }, [el('span', { text: 'Shipping' }), el('span', { text: 'Free' })]),
      el('p', { class: 'terms', text: shipText(items.every(function (i) { var p = product(i.slug); return p && p.readyToShip; })) }),
      el('p', { class: 'cart-policy' }, [el('a', { href: '/shipping', text: 'Shipping' }), document.createTextNode(' \u00b7 '), el('a', { href: '/returns', text: 'Returns' }), document.createTextNode(' \u00b7 '), el('a', { href: '/terms', text: 'Terms' }), document.createTextNode(' \u00b7 '), el('a', { href: '/privacy', text: 'Privacy' })]),
      btn, err,
    ]));
  }

  function checkout(btn, err) {
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'One moment…';
    var items = readCart().map(function (i) {
      var o = i.options || {};
      return { slug: i.slug, qty: i.qty, initials: i.initials || '', options: { color: o.color, thread: o.thread, size: o.size, snap: o.snap, sizeText: o.sizeText } };
    });
    fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.url) { window.location.assign(res.d.url); return; }
        throw new Error(res.d.error || 'Could not start checkout.');
      })
      .catch(function (e) {
        err.textContent = e.message;
        btn.disabled = false; btn.textContent = 'Checkout';
      });
  }

  /* ── drawer ── */
  var dialog = null;
  function buildDrawer() {
    dialog = el('dialog', { class: 'drawer', 'aria-labelledby': 'drawer-title' });
    var close = el('button', { type: 'button', class: 'drawer-close', 'aria-label': 'Close cart', text: '×' });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.append(el('div', { class: 'drawer-inner' }, [
      el('div', { class: 'drawer-head' }, [el('h2', { id: 'drawer-title', text: 'Your cart' }), close]),
      el('div', { class: 'drawer-body', id: 'drawer-body' }),
    ]));
    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  function openDrawer() {
    if (!dialog) return;
    renderAll();
    if (!dialog.open) dialog.showModal();
    var c = dialog.querySelector('.drawer-close'); if (c) c.focus();
  }

  function renderAll() {
    var n = count();
    document.querySelectorAll('.cart-count').forEach(function (s) { s.textContent = String(n); });
    if (dialog) renderCartInto(dialog.querySelector('#drawer-body'));
    var page = document.getElementById('cart-page');
    if (page) renderCartInto(page);
  }

  /* ── pages ── */
  // Wires up a rendered product page: photo gallery, colour-matched photos, add to cart.
  function hydrate(box, slug) {
    var request = box.querySelector('#mto-request');
    // Opens Crisp with the request as the first message; without Crisp the mailto link does the job.
    if (request) request.addEventListener('click', function (e) {
      if (!window.$crisp || typeof $crisp.is !== 'function') return;
      e.preventDefault();
      $crisp.push(['do', 'chat:show']);
      $crisp.push(['do', 'chat:open']);
      $crisp.push(['do', 'message:send', ['text', request.dataset.message]]);
    });
    var form = box.querySelector('#add-form'); // a sold-out piece has no form
    var strip = box.querySelector('.slides');
    var lead = box.querySelector('.slide img'), frame = box.querySelector('.gallery');
    function orient() { if (frame && lead && lead.naturalWidth > lead.naturalHeight) frame.classList.add('landscape'); }
    if (lead) { if (lead.complete) orient(); else lead.addEventListener('load', orient); }
    var slides = [].slice.call(box.querySelectorAll('.slide'));
    var thumbs = [].slice.call(box.querySelectorAll('.thumbs button'));
    var dots = [].slice.call(box.querySelectorAll('.dots button'));
    var count = box.querySelector('.gallery-nav .count');
    var shown = slides.slice(), current = 0;
    function mark(i) {
      current = i;
      thumbs.concat(dots).forEach(function (t, j) { t.setAttribute('aria-current', String(slides[j % slides.length] === shown[i])); });
      if (count) count.textContent = (i + 1) + ' / ' + shown.length;
    }
    function go(i) {
      if (!shown.length) return;
      i = (i + shown.length) % shown.length;
      strip.scrollTo({ left: shown[i].offsetLeft - strip.offsetLeft, behavior: 'smooth' });
      mark(i);
    }
    var t0;
    if (strip) strip.addEventListener('scroll', function () {
      clearTimeout(t0);
      t0 = setTimeout(function () { mark(Math.round(strip.scrollLeft / strip.clientWidth)); }, 80);
    });
    thumbs.concat(dots).forEach(function (t, j) { t.addEventListener('click', function () { var k = shown.indexOf(slides[j % slides.length]); if (k > -1) go(k); }); });
    var prev = box.querySelector('.gallery-nav .prev'), next = box.querySelector('.gallery-nav .next');
    if (prev) prev.addEventListener('click', function () { go(current - 1); });
    if (next) next.addEventListener('click', function () { go(current + 1); });
    if (strip) strip.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    });
    // Picking a colour narrows the photos to that colour, when there are any.
    var colorSel = form && form.querySelector('[name="color"]');
    if (colorSel) colorSel.addEventListener('change', function () {
      var match = slides.filter(function (sl) { return sl.dataset.color === colorSel.value; });
      shown = match.length ? match : slides.slice();
      slides.forEach(function (sl, j) {
        var on = shown.indexOf(sl) > -1;
        sl.hidden = !on;
        if (thumbs[j]) thumbs[j].hidden = !on;
        if (dots[j]) dots[j].hidden = !on;
      });
      strip.scrollTo({ left: 0, behavior: 'instant' });
      mark(0);
    });
    if (!form) return;
    var err = form.querySelector('.error');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var p = product(slug);
      if (!p) { err.textContent = 'The shop is unavailable right now. Please try again.'; return; }
      var f = new FormData(form), options = {};
      ['color', 'thread', 'size', 'snap'].forEach(function (k) { if (f.get(k)) options[k] = f.get(k); });
      if (p.sizeInput) { options.sizeText = String(f.get('sizeText') || '').trim(); options.sizeLabel = p.sizeInput.label; }
      add({ slug: p.slug, qty: Number(f.get('qty') || 1), options: options, initials: String(f.get('initials') || '').trim().toUpperCase() });
    });
  }

  var pages = {
    list: function () {
      var box = document.getElementById('listing');
      var path = location.pathname.replace(/\/$/, '');
      var drafts = DRAFTS ? '?drafts=1' : '';
      var cat = CATS.filter(function (c) { return path === '/shop/' + c.slug; })[0] || null;

      function card(p) {
        var ready = p.section === 'ready', badges = [];
        if (p.needsReview) badges.push('Draft');
        if (ready && p.stock > 1) badges.push('Only ' + p.stock + ' left');
        var ph = photos(p)[0], tileSrc = TILES.indexOf(p.slug) > -1 ? '/img/' + p.slug + '/tile.jpg' : ph && ph.src;
        var nm = cardName(p), title = nm.title, sub = nm.sub;
        return el('li', {}, [el('a', { class: 'card', href: '/shop/' + encodeURIComponent(p.slug) + drafts }, [
          el('div', { class: 'card-img' }, [tileSrc ? el('img', { src: tileSrc, alt: '', loading: 'lazy' }) : el('span', { text: 'Photos coming soon' })]),
          badges.length ? el('div', { class: 'badges' }, badges.map(function (b) { return el('span', { class: 'badge', text: b }); })) : null,
          el('div', { class: 'card-body' }, [
            el('h2', { text: title }),
            sub ? el('div', { class: 'leather', text: sub }) : null,
            el('div', { class: 'price', text: money(p.amount) }),
          ]),
        ])]);
      }
      // The same tabs on every shop page, so a visitor can move between the three.
      var tabs = document.getElementById('shop-tabs');
      // The tabs and the intro line belong to the three pages; the /shop landing is just its tiles.
      if (cat) [{ slug: '', title: 'All' }].concat(CATS).forEach(function (c) {
        var href = '/shop' + (c.slug ? '/' + c.slug : '');
        var a = el('a', { href: href + drafts, text: c.title });
        if (path === href) a.setAttribute('aria-current', 'page');
        tabs.append(a);
      });
      tabs.hidden = !cat;

      // The header link for this page: Belts for Belts, Shop for everything else.
      var navHref = cat && cat.slug === 'belts' ? '/shop/belts' : '/shop';
      document.querySelectorAll('.site-nav a').forEach(function (a) { a.removeAttribute('aria-current'); });
      var cur = [].filter.call(document.querySelectorAll('.site-nav a'), function (a) { return a.getAttribute('href') === navHref; })[0];
      if (cur) cur.setAttribute('aria-current', 'page');

      if (cat) {
        document.title = cat.title + ' \u2014 Handmade in Indiana | Traders Point Leather';
        document.getElementById('shop-title').textContent = cat.title;
        document.getElementById('shop-lede').textContent = cat.lede;
        document.getElementById('shop-lede').hidden = false;
      }

      catalogPromise.then(function (c) {
        var all = c.products.filter(function (p) { return p.slug !== 'monogram'; });
        box.replaceChildren();
        if (cat) {
          var items = all.filter(cat.has);
          if (!items.length) { box.append(el('p', { class: 'muted', text: cat.empty })); return; }
          box.append(el('ul', { class: 'grid' }, items.map(card)));
        } else {
          box.append(el('ul', { class: 'grid tiles' }, CATS.map(function (k) { return tile(k, all.filter(k.has)); })));
        }
      }).catch(function () { box.textContent = 'The shop is unavailable right now. Please try again shortly.'; });
    },

    product: function () {
      var box = document.getElementById('product');
      var slug = decodeURIComponent(location.pathname.replace(/^\/shop\//, '').replace(/\/$/, ''));
      // The server renders the page; only when it did not (local preview) is it built here.
      var ready = box.hasAttribute('data-ssr') ? Promise.resolve() : catalogPromise.then(function (c) {
        var p = product(slug);
        if (!p || !visible(p)) {
          box.innerHTML = '<h1>Not available</h1><p class="lede">This piece is sold out or no longer listed.</p><a href="/shop">Back to the shop</a>';
          return Promise.reject('missing');
        }
        return import('/shop/product-html.js').then(function (m) {
          box.innerHTML = m.productHtml(p, { photos: photos(p), monogram: c.monogram });
          document.title = p.name + ' \u2014 Handmade in Indiana | Traders Point Leather';
        });
      });
      ready.then(function () { return catalogPromise.catch(function () {}); }).then(function () { hydrate(box, slug); }, function () {});
    },

    cart: function () { /* rendered by renderAll once the catalog loads */ },

    thanks: function () {
      var box = document.getElementById('thanks');
      var id = new URLSearchParams(location.search).get('session_id');
      if (!id) { box.textContent = 'No order found.'; return; }
      fetch('/api/order?session_id=' + encodeURIComponent(id))
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (o) {
          box.replaceChildren();
          if (!o.paid) { box.append(el('p', { text: 'Your payment has not completed yet. If you were charged, email customer-support@traderspointleather.com.' })); return; }
          writeCart([]);
          var ul = el('ul', {});
          (o.details.length ? o.details : o.items.map(function (i) { return i.name + ' x' + i.quantity; })).forEach(function (t) { ul.append(el('li', { text: t })); });
          box.append.apply(box, [
            el('p', { class: 'lede', text: 'A receipt is on its way to ' + (o.email || 'your email') + (o.readyToShip ? '. Your order ships in 1\u20133 business days.' : '. Your order ships in 1\u20132 weeks.') }),
            ul,
            el('p', { class: 'cart-summary subtotal', text: 'Total: ' + money(o.total) }),
            o.shipTo ? el('p', { class: 'muted', text: 'Shipping to ' + o.shipTo.name + ', ' + o.shipTo.lines.join(', ') }) : null,
            el('p', {}, [el('a', { href: '/shop', text: 'Back to the shop' })])
          ].filter(Boolean));
        })
        .catch(function () { box.textContent = 'We could not load that order. Your payment receipt is in your email.'; });
    },
  };

  // Header menu (phones), the same as the home page's.
  function wireMenu() {
    var btn = document.querySelector('.nav-toggle'), nav = document.getElementById('site-nav');
    if (!btn || !nav) return;
    function setOpen(open) {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); btn.focus(); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireMenu();
    buildDrawer();
    var btn = document.querySelector('.cart-btn');
    if (btn) btn.addEventListener('click', function () {
      // On the cart page the page itself is the cart.
      if (document.getElementById('cart-page')) return;
      openDrawer();
    });
    renderAll();
    var page = pages[document.body.dataset.page];
    if (page) page();
  });

  window.TPL = { add: add, catalogPromise: catalogPromise };
})();
