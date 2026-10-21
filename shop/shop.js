/* Cart and shop pages. Vanilla, no framework. The cart holds only
   {slug, qty, options, initials}: prices are never stored here, they come from
   /api/catalog on every load, and /api/checkout looks them up again. */
(function () {
  'use strict';

  var KEY = 'tpl-cart-v1';
  var RETURNS = 'Free shipping (US) · Ships in 1–3 business days, arrives in 5–7 days in the lower 48 · 30-day returns if undamaged (buyer pays return shipping)';
  var memory = null; // used when localStorage is unavailable
  var catalog = null;
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
  // During launch review, products whose Stripe description is still a draft stay out of public view.
  function visible(p) { return !(window.SHOP_PUBLIC && p.needsReview); }
  function maxQty(p) { return p.oneOfAKind ? 1 : p.stock ? Math.min(p.stock, 10) : 10; }
  function optionText(i) {
    var o = i.options || {}, parts = [];
    ['color', 'thread', 'size'].forEach(function (k) { if (o[k]) parts.push(k[0].toUpperCase() + k.slice(1) + ': ' + o[k]); });
    if (o.sizeText) parts.push(o.sizeLabel + ': ' + o.sizeText);
    if (i.initials) parts.push('Initials: ' + i.initials);
    return parts.join(' · ');
  }

  /* ── catalog ── */
  var catalogPromise = fetch('/api/catalog')
    .then(function (r) { if (!r.ok) throw new Error('catalog'); return r.json(); })
    .then(function (c) { catalog = c; prune(); return c; });

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
  function lineTotal(i, p) { return (p.amount + (i.initials && catalog.monogram ? catalog.monogram.amount : 0)) * i.qty; }

  function renderCartInto(box, onCheckout) {
    box.replaceChildren();
    var items = readCart();
    if (notice) box.append(el('p', { class: 'notice', role: 'status', text: notice }));
    if (!catalog) { box.append(el('p', { class: 'cart-empty', text: 'Loading your cart…' })); return; }
    if (!items.length) {
      box.append(el('p', { class: 'cart-empty', text: 'Your cart is empty.' }), el('a', { href: '/shop', text: 'Browse the shop' }));
      return;
    }
    var ul = el('ul', { class: 'cart-lines' }), subtotal = 0;
    items.forEach(function (i, idx) {
      var p = product(i.slug); if (!p) return;
      var total = lineTotal(i, p); subtotal += total;
      var thumb = p.images[0] ? el('img', { src: p.images[0], alt: '', width: '72', height: '72' }) : el('div', { class: 'ph' });
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
          el('h3', { text: p.name }),
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
      el('p', { class: 'terms', text: RETURNS }),
      btn, err,
    ]));
  }

  function checkout(btn, err) {
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'One moment…';
    var items = readCart().map(function (i) {
      var o = i.options || {};
      return { slug: i.slug, qty: i.qty, initials: i.initials || '', options: { color: o.color, thread: o.thread, size: o.size, sizeText: o.sizeText } };
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
  var pages = {
    list: function () {
      var box = document.getElementById('listing');
      catalogPromise.then(function (c) {
        var ps = c.products.filter(visible);
        box.replaceChildren();
        if (!ps.length) { box.append(el('p', { class: 'muted', text: 'Nothing in the shop right now.' })); return; }
        var ul = el('ul', { class: 'grid' });
        ps.forEach(function (p) {
          ul.append(el('li', {}, [el('a', { class: 'card', href: '/shop/' + encodeURIComponent(p.slug) }, [
            el('div', { class: 'card-img' }, [p.images[0] ? el('img', { src: p.images[0], alt: '', loading: 'lazy' }) : el('span', { text: 'Photos coming soon' })]),
            el('div', { class: 'card-body' }, [el('h2', { text: p.name }), el('div', { class: 'price', text: money(p.amount) })]),
          ])]));
        });
        box.append(ul);
      }).catch(function () { box.textContent = 'The shop is unavailable right now. Please try again shortly.'; });
    },

    product: function () {
      var box = document.getElementById('product');
      var slug = decodeURIComponent(location.pathname.replace(/^\/shop\//, '').replace(/\/$/, ''));
      catalogPromise.then(function (c) {
        var p = product(slug);
        box.replaceChildren();
        if (!p || !visible(p)) {
          box.append(el('h1', { text: 'Not available' }), el('p', { class: 'lede', text: 'This piece is sold out or no longer listed.' }), el('a', { href: '/shop', text: 'Back to the shop' }));
          return;
        }
        document.title = p.name + ' — Traders Point Leather';
        var main = el('div', { class: 'gallery-main' });
        function show(src) { main.replaceChildren(src ? el('img', { src: src, alt: p.name }) : el('span', { text: 'Photos coming soon' })); }
        show(p.images[0]);
        var thumbs = el('div', { class: 'thumbs' });
        if (p.images.length > 1) p.images.forEach(function (src, i) {
          var b = el('button', { type: 'button', 'aria-label': 'Show photo ' + (i + 1), 'aria-current': i === 0 ? 'true' : 'false' }, [el('img', { src: src, alt: '' })]);
          b.addEventListener('click', function () {
            show(src);
            thumbs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-current', 'false'); });
            b.setAttribute('aria-current', 'true');
          });
          thumbs.append(b);
        });

        var form = el('form', { novalidate: '' });
        function field(id, label, control, hint) {
          form.append(el('div', { class: 'field' }, [el('label', { for: id, text: label }), control, hint ? el('p', { class: 'hint', text: hint }) : null]));
        }
        function select(id, list) {
          var s = el('select', { id: id, required: '' }, [el('option', { value: '', text: 'Choose…' })]);
          list.forEach(function (v) { s.append(el('option', { value: v, text: v })); });
          return s;
        }
        ['color', 'thread', 'size'].forEach(function (k) {
          if (p.options[k].length) field('opt-' + k, k[0].toUpperCase() + k.slice(1), select('opt-' + k, p.options[k]));
        });
        if (p.sizeInput) field('opt-sizeText', p.sizeInput.label, el('input', { id: 'opt-sizeText', type: 'text', required: '', maxlength: '20', autocomplete: 'off' }));
        if (p.monogram && c.monogram) field('initials', 'Monogram initials (optional, +' + money(c.monogram.amount) + ')',
          el('input', { id: 'initials', type: 'text', maxlength: '4', pattern: '[A-Za-z]{1,4}', autocomplete: 'off' }), 'Up to 4 letters.');
        var cap = maxQty(p);
        if (cap > 1) {
          var q = el('select', { id: 'qty' });
          for (var n = 1; n <= cap; n++) q.append(el('option', { value: String(n), text: String(n) }));
          field('qty', 'Quantity', q);
        }
        var err = el('p', { class: 'error', role: 'alert' });
        var btn = el('button', { type: 'submit', class: 'btn', text: 'Add to cart' });
        form.append(btn, err);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          err.textContent = '';
          var bad = form.querySelector(':invalid');
          if (bad) { err.textContent = 'Please complete the highlighted option.'; bad.focus(); return; }
          var g = function (id) { var n = document.getElementById(id); return n ? n.value : ''; };
          var options = {};
          ['color', 'thread', 'size'].forEach(function (k) { if (p.options[k].length) options[k] = g('opt-' + k); });
          if (p.sizeInput) { options.sizeText = g('opt-sizeText').trim(); options.sizeLabel = p.sizeInput.label; }
          add({ slug: p.slug, qty: Number(g('qty') || 1), options: options, initials: g('initials').trim().toUpperCase() });
        });

        box.append(el('div', { class: 'product' }, [
          el('div', {}, [main, thumbs]),
          el('div', {}, [
            el('h1', { text: p.name }),
            el('div', { class: 'price', text: money(p.amount) }),
            el('p', { class: 'desc', text: p.description }),
            p.oneOfAKind ? el('p', { class: 'notice', text: 'One of a kind: once it is sold, it is gone.' }) : null,
            form,
            el('p', { class: 'terms', text: RETURNS }),
          ]),
        ]));
      }).catch(function () { box.textContent = 'The shop is unavailable right now. Please try again shortly.'; });
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
          box.append(
            el('p', { class: 'lede', text: 'A receipt is on its way to ' + (o.email || 'your email') + '. Orders ship within 1–3 business days.' }),
            ul,
            el('p', { class: 'cart-summary subtotal', text: 'Total: ' + money(o.total) }),
            o.shipTo ? el('p', { class: 'muted', text: 'Shipping to ' + o.shipTo.name + ', ' + o.shipTo.lines.join(', ') }) : null,
            el('p', {}, [el('a', { href: '/shop', text: 'Back to the shop' })])
          );
        })
        .catch(function () { box.textContent = 'We could not load that order. Your payment receipt is in your email.'; });
    },
  };

  document.addEventListener('DOMContentLoaded', function () {
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
