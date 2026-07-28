/* ============================================================
   THE KIRAN FASHION — MEESHO CRM
   app.js — all application logic (vanilla JS, Firebase compat SDK)
   ============================================================ */

/* ---------------- CONSTANTS ---------------- */
var STATUSES = ['On Hold', 'Pending', 'Ready To Ship', 'Shipped', 'Completed', 'Cancelled'];

var STATUS_META = {
  'On Hold':        { color: '#B5651D', bg: '#FDF0E3' },
  'Pending':        { color: '#5B67CA', bg: '#ECEDFA' },
  'Ready To Ship':  { color: '#0FA5AE', bg: '#E2F6F7' },
  'Shipped':        { color: '#8E44AD', bg: '#F3E7F7' },
  'Completed':      { color: '#1E8449', bg: '#E6F7ED' },
  'Cancelled':      { color: '#E24B4A', bg: '#FBEAEA' }
};

var SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'];
var COURIERS = ['Valmo', 'Delhivery', 'Shadowfax', 'Xpressbees', 'Ecom Express'];

/* ---------------- STATE ---------------- */
var currentUser = null;
var orders = [];
var products = [];
var ordersUnsub = null;
var productsUnsub = null;
var editingOrderId = null;
var editingProductId = null;
var reviewData = null;

/* ---------------- SMALL UTILITIES ---------------- */
function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(n) {
  var num = Number(n) || 0;
  return '\u20B9' + num.toLocaleString('en-IN');
}

function formatDateTime(date) {
  if (!date) return 'Just now';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatPickupDate(str) {
  if (!str) return '\u2014';
  var d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayInputValue() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function isSameDay(date, ref) {
  if (!date) return false;
  return date.getFullYear() === ref.getFullYear() &&
         date.getMonth() === ref.getMonth() &&
         date.getDate() === ref.getDate();
}

function isSameMonth(date, ref) {
  if (!date) return false;
  return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
}

function startOfYesterday() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function toDateSafe(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return null;
}

function orderCode(id) {
  return 'KF-' + id.slice(-6).toUpperCase();
}

function showToast(message, type) {
  var toast = $('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () {
    toast.className = 'toast';
  }, 3200);
}

/* ---------------- SVG ICONS ---------------- */
function iconEdit() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
}
function iconTrash() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
}
function iconBoxes() {
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8L12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>';
}

/* ============================================================
   AUTH
   ============================================================ */
$('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var email = $('login-email').value.trim();
  var password = $('login-password').value;
  var errorBox = $('login-error');
  var btn = $('login-btn');
  errorBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  auth.signInWithEmailAndPassword(email, password)
    .catch(function (err) {
      var msg = 'Login failed. Please check your email and password.';
      if (err && err.code === 'auth/invalid-email') msg = 'That email address looks invalid.';
      if (err && err.code === 'auth/user-not-found') msg = 'No account found with that email.';
      if (err && err.code === 'auth/wrong-password') msg = 'Incorrect password.';
      if (err && err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please wait and try again.';
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = 'Log in';
    });
});

$('logout-link').addEventListener('click', function (e) {
  e.preventDefault();
  auth.signOut();
});

auth.onAuthStateChanged(function (user) {
  if (user) {
    currentUser = user;
    $('side-user').textContent = user.email;
    $('login-view').style.display = 'none';
    $('app-view').classList.add('active');
    $('login-form').reset();
    $('login-error').style.display = 'none';
    attachListeners();
    showSection('dashboard');
  } else {
    currentUser = null;
    detachListeners();
    orders = [];
    products = [];
    $('app-view').classList.remove('active');
    $('login-view').style.display = 'flex';
  }
});

function attachListeners() {
  if (ordersUnsub) ordersUnsub();
  if (productsUnsub) productsUnsub();

  ordersUnsub = db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(function (snap) {
    orders = snap.docs.map(function (doc) {
      var d = doc.data();
      return Object.assign({}, d, {
        id: doc.id,
        createdAt: toDateSafe(d.createdAt),
        statusUpdatedAt: toDateSafe(d.statusUpdatedAt),
        updatedAt: toDateSafe(d.updatedAt)
      });
    });
    renderDashboard();
    renderOrdersTable();
    renderReports();
  }, function (err) {
    showToast('Could not load orders: ' + err.message, 'error');
  });

  productsUnsub = db.collection('products').orderBy('name').onSnapshot(function (snap) {
    products = snap.docs.map(function (doc) {
      return Object.assign({}, doc.data(), { id: doc.id });
    });
    renderProductsTable();
    renderStockTable();
    renderProductDatalists();
  }, function (err) {
    showToast('Could not load products: ' + err.message, 'error');
  });
}

function detachListeners() {
  if (ordersUnsub) { ordersUnsub(); ordersUnsub = null; }
  if (productsUnsub) { productsUnsub(); productsUnsub = null; }
}

/* ============================================================
   NAVIGATION / SECTION SWITCHING
   ============================================================ */
var SECTION_TITLES = {
  'dashboard': 'Dashboard',
  'orders': 'Orders',
  'order-form': 'Order form',
  'review-order': 'Review order',
  'products': 'Products',
  'stock': 'Stock management',
  'reports': 'Reports'
};

function showSection(name) {
  document.querySelectorAll('.view-section').forEach(function (sec) { sec.classList.remove('active'); });
  var target = $('section-' + name);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(function (link) {
    link.classList.toggle('active', link.getAttribute('data-section') === name);
  });

  $('page-title').textContent = SECTION_TITLES[name] || 'Dashboard';

  if (window.innerWidth <= 640) {
    $('sidebar').classList.remove('mobile-open');
    $('sidebar-overlay').classList.remove('show');
  }
  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-link').forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    showSection(link.getAttribute('data-section'));
  });
});

document.querySelectorAll('[data-goto]').forEach(function (btn) {
  btn.addEventListener('click', function () { showSection(btn.getAttribute('data-goto')); });
});

$('topbar-new-order-btn').addEventListener('click', function () { openOrderForm(null); });
$('orders-new-btn').addEventListener('click', function () { openOrderForm(null); });

/* ---------------- SIDEBAR TOGGLE ---------------- */
var sidebar = $('sidebar');
var main = $('main');
var overlay = $('sidebar-overlay');
var hamburger = $('hamburger-btn');

function isMobile() { return window.innerWidth <= 640; }

hamburger.addEventListener('click', function () {
  if (isMobile()) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('show');
  } else {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('sidebar-collapsed');
  }
});
overlay.addEventListener('click', function () {
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('show');
});
window.addEventListener('resize', function () {
  if (!isMobile()) {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
  }
});

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function showModal(html) {
  $('modal-box').innerHTML = html;
  $('modal-overlay').classList.add('show');
}
function closeModal() {
  $('modal-overlay').classList.remove('show');
  $('modal-box').innerHTML = '';
}
$('modal-overlay').addEventListener('click', function (e) {
  if (e.target === $('modal-overlay')) closeModal();
});

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  var now = new Date();
  var yesterday = startOfYesterday();

  var countByStatus = {};
  STATUSES.forEach(function (s) { countByStatus[s] = 0; });
  orders.forEach(function (o) { if (countByStatus[o.status] !== undefined) countByStatus[o.status]++; });

  var todaysOrders = orders.filter(function (o) { return isSameDay(o.createdAt, now); }).length;
  var yesterdaysOrders = orders.filter(function (o) { return isSameDay(o.createdAt, yesterday); }).length;
  var todaysShipped = orders.filter(function (o) { return o.status === 'Shipped' && isSameDay(o.statusUpdatedAt, now); }).length;
  var yesterdaysShipped = orders.filter(function (o) { return o.status === 'Shipped' && isSameDay(o.statusUpdatedAt, yesterday); }).length;
  var totalOrders = orders.length;
  var paymentPending = orders.filter(function (o) {
    return o.paymentType === 'COD' && o.status !== 'Completed' && o.status !== 'Cancelled';
  }).length;

  var cards = [
    { label: 'On Hold', value: countByStatus['On Hold'], meta: STATUS_META['On Hold'] },
    { label: 'Pending', value: countByStatus['Pending'], meta: STATUS_META['Pending'] },
    { label: 'Ready To Ship', value: countByStatus['Ready To Ship'], meta: STATUS_META['Ready To Ship'] },
    { label: 'Shipped', value: countByStatus['Shipped'], meta: STATUS_META['Shipped'] },
    { label: 'Cancelled', value: countByStatus['Cancelled'], meta: STATUS_META['Cancelled'] },
    { label: "Today's Orders", value: todaysOrders, meta: { color: '#6C2BD9', bg: '#EFE7FC' } },
    { label: "Today's Shipped", value: todaysShipped, meta: STATUS_META['Shipped'] },
    { label: 'Yesterday Orders', value: yesterdaysOrders, meta: { color: '#6C2BD9', bg: '#EFE7FC' } },
    { label: 'Yesterday Shipped', value: yesterdaysShipped, meta: STATUS_META['Shipped'] },
    { label: 'Total Orders', value: totalOrders, meta: { color: '#211B2E', bg: '#F4F1FA' } },
    { label: 'Payment Pending', value: paymentPending, meta: { color: '#C08A00', bg: '#FCF3D9' } }
  ];

  $('dashboard-cards').innerHTML = cards.map(function (c) {
    return '<div class="metric-card">'
      + '<div class="metric-label">' + escapeHtml(c.label) + '</div>'
      + '<div class="metric-value">' + c.value + '<span class="unit">orders</span></div>'
      + '<div class="metric-bar" style="background:' + c.meta.color + '"></div>'
      + '</div>';
  }).join('');

  var recent = orders.slice(0, 5);
  $('recent-orders-body').innerHTML = recent.length ? recent.map(function (o) {
    var meta = STATUS_META[o.status] || STATUS_META['On Hold'];
    return '<tr>'
      + '<td class="num">' + orderCode(o.id) + '</td>'
      + '<td>' + escapeHtml(o.customerName) + '</td>'
      + '<td>' + escapeHtml(o.productName) + '</td>'
      + '<td><span class="badge" style="background:' + meta.bg + '; color:' + meta.color + '">' + escapeHtml(o.status) + '</span></td>'
      + '<td class="num">' + formatCurrency(o.amount) + '</td>'
      + '</tr>';
  }).join('') : '<tr><td colspan="5" class="empty-note">No orders yet. Create your first order.</td></tr>';
}

/* ============================================================
   ORDERS TABLE
   ============================================================ */
function getFilteredOrders() {
  var q = $('order-search').value.trim().toLowerCase();
  var statusFilter = $('order-status-filter').value;
  var courierFilter = $('order-courier-filter').value;

  return orders.filter(function (o) {
    if (statusFilter && o.status !== statusFilter) return false;
    if (courierFilter && o.courier !== courierFilter) return false;
    if (q) {
      var hay = [o.customerName, o.productName, o.sku, o.mobile].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function statusSelectHtml(order) {
  var meta = STATUS_META[order.status] || STATUS_META['On Hold'];
  var opts = STATUSES.map(function (s) {
    return '<option value="' + s + '"' + (s === order.status ? ' selected' : '') + '>' + s + '</option>';
  }).join('');
  return '<select class="status-select" data-order-id="' + order.id + '" style="background:' + meta.bg + '; color:' + meta.color + '">' + opts + '</select>';
}

function renderOrdersTable() {
  var list = getFilteredOrders();
  var body = $('orders-table-body');
  var emptyNote = $('orders-empty-note');

  if (!list.length) {
    body.innerHTML = '';
    emptyNote.style.display = 'block';
    return;
  }
  emptyNote.style.display = 'none';

  body.innerHTML = list.map(function (o) {
    return '<tr>'
      + '<td class="num">' + orderCode(o.id) + '</td>'
      + '<td>' + escapeHtml(o.customerName) + (o.mobile ? '<br><span style="color:var(--text-faint);font-size:11.5px;">' + escapeHtml(o.mobile) + '</span>' : '') + '</td>'
      + '<td>' + escapeHtml(o.productName) + '<br><span class="mono" style="color:var(--text-faint);font-size:11.5px;">' + escapeHtml(o.sku) + '</span></td>'
      + '<td>' + escapeHtml(o.size) + '</td>'
      + '<td>' + o.qty + '</td>'
      + '<td>' + o.paymentType + '</td>'
      + '<td>' + escapeHtml(o.courier) + '</td>'
      + '<td>' + formatPickupDate(o.pickupDate) + '</td>'
      + '<td>' + statusSelectHtml(o) + '</td>'
      + '<td class="num">' + formatCurrency(o.amount) + '</td>'
      + '<td><div class="row-actions">'
        + '<button data-action="edit-order" data-id="' + o.id + '" aria-label="Edit order">' + iconEdit() + '</button>'
        + '<button data-action="delete-order" data-id="' + o.id + '" class="danger" aria-label="Delete order">' + iconTrash() + '</button>'
      + '</div></td>'
      + '</tr>';
  }).join('');
}

$('order-search').addEventListener('input', renderOrdersTable);
$('order-status-filter').addEventListener('change', renderOrdersTable);
$('order-courier-filter').addEventListener('change', renderOrdersTable);

$('orders-table-body').addEventListener('click', function (e) {
  var editBtn = e.target.closest('[data-action="edit-order"]');
  var delBtn = e.target.closest('[data-action="delete-order"]');
  if (editBtn) openOrderForm(editBtn.getAttribute('data-id'));
  if (delBtn) openDeleteConfirm('order', delBtn.getAttribute('data-id'));
});

$('orders-table-body').addEventListener('change', function (e) {
  if (e.target.classList.contains('status-select')) {
    var id = e.target.getAttribute('data-order-id');
    var newStatus = e.target.value;
    db.collection('orders').doc(id).update({
      status: newStatus,
      statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      showToast('Order status updated to ' + newStatus, 'success');
    }).catch(function (err) {
      showToast('Could not update status: ' + err.message, 'error');
    });
  }
});

/* ============================================================
   ORDER FORM
   ============================================================ */
function resetOrderForm() {
  $('order-form').reset();
  $('f-qty').value = 1;
  $('f-pickup-date').value = todayInputValue();
  $('order-form-error').style.display = 'none';
}

function openOrderForm(orderId) {
  editingOrderId = orderId || null;
  resetOrderForm();

  if (editingOrderId) {
    var o = orders.find(function (x) { return x.id === editingOrderId; });
    if (!o) { showToast('Order not found', 'error'); return; }
    $('order-form-title').textContent = 'Edit order';
    $('f-customer-name').value = o.customerName || '';
    $('f-address').value = o.address || '';
    $('f-mobile').value = o.mobile || '';
    $('f-product-name').value = o.productName || '';
    $('f-sku').value = o.sku || '';
    $('f-color').value = o.color || '';
    $('f-size').value = o.size || '';
    $('f-qty').value = o.qty || 1;
    $('f-amount').value = o.amount || '';
    $('f-payment').value = o.paymentType || '';
    $('f-courier').value = o.courier || '';
    $('f-pickup-date').value = o.pickupDate || todayInputValue();
    $('f-note').value = o.note || '';
    $('f-created-by').value = o.createdBy || '';
    $('f-created-at').value = formatDateTime(o.createdAt);
  } else {
    $('order-form-title').textContent = 'New order';
    $('f-created-by').value = currentUser ? currentUser.email : '';
    $('f-created-at').value = formatDateTime(new Date());
  }
  showSection('order-form');
}

$('order-form-cancel-btn').addEventListener('click', function () {
  showSection(editingOrderId ? 'orders' : 'dashboard');
});

$('order-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var errorBox = $('order-form-error');
  errorBox.style.display = 'none';

  var data = {
    customerName: $('f-customer-name').value.trim(),
    address: $('f-address').value.trim(),
    mobile: $('f-mobile').value.trim(),
    productName: $('f-product-name').value.trim(),
    sku: $('f-sku').value.trim(),
    color: $('f-color').value.trim(),
    size: $('f-size').value,
    qty: parseInt($('f-qty').value, 10),
    amount: parseFloat($('f-amount').value),
    paymentType: $('f-payment').value,
    courier: $('f-courier').value,
    pickupDate: $('f-pickup-date').value,
    note: $('f-note').value.trim(),
    createdBy: $('f-created-by').value
  };

  if (!data.customerName || !data.address || !data.productName || !data.sku || !data.size ||
      !data.paymentType || !data.courier || !data.pickupDate) {
    errorBox.textContent = 'Please fill in every required field marked with *.';
    errorBox.style.display = 'block';
    return;
  }
  if (data.mobile && !/^[0-9]{10}$/.test(data.mobile)) {
    errorBox.textContent = 'Mobile number must be exactly 10 digits, or left blank.';
    errorBox.style.display = 'block';
    return;
  }
  if (!data.qty || data.qty < 1 || data.qty > 10) {
    errorBox.textContent = 'Quantity must be between 1 and 10.';
    errorBox.style.display = 'block';
    return;
  }
  if (isNaN(data.amount) || data.amount < 0) {
    errorBox.textContent = 'Please enter a valid order amount.';
    errorBox.style.display = 'block';
    return;
  }

  reviewData = data;
  renderReview();
  showSection('review-order');
});

/* ============================================================
   REVIEW ORDER
   ============================================================ */
function renderReview() {
  if (!reviewData) return;
  var r = reviewData;
  var items = [
    ['Company', 'Meesho'],
    ['Customer name', r.customerName],
    ['Mobile number', r.mobile || '\u2014'],
    ['Address', r.address, true],
    ['Product name', r.productName],
    ['SKU', r.sku],
    ['Color', r.color || '\u2014'],
    ['Size', r.size],
    ['Quantity', r.qty],
    ['Order amount', formatCurrency(r.amount)],
    ['Payment type', r.paymentType],
    ['Courier partner', r.courier],
    ['Pickup date', formatPickupDate(r.pickupDate)],
    ['Special note', r.note || '\u2014', true],
    ['Created by', r.createdBy]
  ];
  $('review-grid').innerHTML = items.map(function (it) {
    return '<div class="review-item' + (it[2] ? ' wide' : '') + '">'
      + '<div class="rlabel">' + escapeHtml(it[0]) + '</div>'
      + '<div class="rvalue">' + escapeHtml(String(it[1])) + '</div>'
      + '</div>';
  }).join('');
}

$('review-back-btn').addEventListener('click', function () {
  showSection('order-form');
});

$('review-confirm-btn').addEventListener('click', function () {
  if (!reviewData) return;
  var btn = $('review-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  var payload = Object.assign({}, reviewData, { company: 'Meesho' });
  var promise;

  if (editingOrderId) {
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    promise = db.collection('orders').doc(editingOrderId).update(payload);
  } else {
    payload.status = 'On Hold';
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.statusUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    promise = db.collection('orders').add(payload);
  }

  promise.then(function () {
    showToast(editingOrderId ? 'Order updated successfully' : 'Order saved successfully', 'success');
    editingOrderId = null;
    reviewData = null;
    showSection('orders');
  }).catch(function (err) {
    showToast('Could not save order: ' + err.message, 'error');
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = 'Confirm & save order';
  });
});

/* ============================================================
   PRODUCTS
   ============================================================ */
function renderProductDatalists() {
  $('product-name-list').innerHTML = products.map(function (p) {
    return '<option value="' + escapeHtml(p.name) + '">';
  }).join('');
  $('product-sku-list').innerHTML = products.map(function (p) {
    return '<option value="' + escapeHtml(p.sku) + '">';
  }).join('');
}

$('f-sku').addEventListener('input', function () {
  var match = products.find(function (p) { return p.sku.toLowerCase() === $('f-sku').value.trim().toLowerCase(); });
  if (match) {
    if (!$('f-product-name').value) $('f-product-name').value = match.name;
    if (!$('f-color').value && match.color) $('f-color').value = match.color;
  }
});

function getFilteredProducts() {
  var q = $('product-search').value.trim().toLowerCase();
  if (!q) return products;
  return products.filter(function (p) {
    return (p.name + ' ' + p.sku).toLowerCase().indexOf(q) !== -1;
  });
}

function renderProductsTable() {
  var list = getFilteredProducts();
  var body = $('products-table-body');
  var emptyNote = $('products-empty-note');

  if (!list.length) {
    body.innerHTML = '';
    emptyNote.style.display = 'block';
    return;
  }
  emptyNote.style.display = 'none';

  body.innerHTML = list.map(function (p) {
    return '<tr>'
      + '<td>' + escapeHtml(p.name) + '</td>'
      + '<td class="mono">' + escapeHtml(p.sku) + '</td>'
      + '<td>' + escapeHtml(p.color || '\u2014') + '</td>'
      + '<td>' + escapeHtml(p.sizes || '\u2014') + '</td>'
      + '<td class="num">' + formatCurrency(p.price) + '</td>'
      + '<td class="num">' + (p.stock || 0) + '</td>'
      + '<td><div class="row-actions">'
        + '<button data-action="edit-product" data-id="' + p.id + '" aria-label="Edit product">' + iconEdit() + '</button>'
        + '<button data-action="delete-product" data-id="' + p.id + '" class="danger" aria-label="Delete product">' + iconTrash() + '</button>'
      + '</div></td>'
      + '</tr>';
  }).join('');
}

$('product-search').addEventListener('input', renderProductsTable);
$('add-product-btn').addEventListener('click', function () { openProductModal(null); });

$('products-table-body').addEventListener('click', function (e) {
  var editBtn = e.target.closest('[data-action="edit-product"]');
  var delBtn = e.target.closest('[data-action="delete-product"]');
  if (editBtn) openProductModal(editBtn.getAttribute('data-id'));
  if (delBtn) openDeleteConfirm('product', delBtn.getAttribute('data-id'));
});

function openProductModal(productId) {
  editingProductId = productId || null;
  var p = editingProductId ? products.find(function (x) { return x.id === editingProductId; }) : null;

  var html = '<h3>' + (p ? 'Edit product' : 'Add product') + '</h3>'
    + '<div class="field"><label for="pm-name">Product name *</label><input id="pm-name" type="text" value="' + escapeHtml(p ? p.name : '') + '" placeholder="e.g. Kiran Cotton Kurti"></div>'
    + '<div class="field"><label for="pm-sku">SKU *</label><input id="pm-sku" type="text" value="' + escapeHtml(p ? p.sku : '') + '" placeholder="e.g. KF-KUR-001"></div>'
    + '<div class="field"><label for="pm-color">Color (optional)</label><input id="pm-color" type="text" value="' + escapeHtml(p && p.color ? p.color : '') + '"></div>'
    + '<div class="field"><label for="pm-sizes">Sizes available (comma separated, optional)</label><input id="pm-sizes" type="text" value="' + escapeHtml(p && p.sizes ? p.sizes : '') + '" placeholder="S, M, L, XL"></div>'
    + '<div class="field"><label for="pm-price">Price (&#8377;) *</label><input id="pm-price" type="number" min="0" value="' + (p ? p.price : '') + '"></div>'
    + '<div class="field"><label for="pm-stock">' + (p ? 'Current stock *' : 'Opening stock *') + '</label><input id="pm-stock" type="number" min="0" value="' + (p ? p.stock : 0) + '"></div>'
    + '<div class="form-error" id="pm-error" style="display:none;"></div>'
    + '<div class="modal-actions">'
      + '<button class="btn btn-ghost" id="pm-cancel">Cancel</button>'
      + '<button class="btn btn-primary" id="pm-save">' + (p ? 'Save changes' : 'Add product') + '</button>'
    + '</div>';

  showModal(html);
  $('pm-cancel').addEventListener('click', closeModal);
  $('pm-save').addEventListener('click', function () { saveProductFromModal(editingProductId); });
}

function saveProductFromModal(productId) {
  var name = $('pm-name').value.trim();
  var sku = $('pm-sku').value.trim();
  var color = $('pm-color').value.trim();
  var sizes = $('pm-sizes').value.trim();
  var price = parseFloat($('pm-price').value);
  var stock = parseInt($('pm-stock').value, 10);
  var errorBox = $('pm-error');

  if (!name || !sku || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
    errorBox.textContent = 'Please fill in all required fields with valid values.';
    errorBox.style.display = 'block';
    return;
  }

  var payload = { name: name, sku: sku, color: color, sizes: sizes, price: price, stock: stock };
  var promise = productId
    ? db.collection('products').doc(productId).update(payload)
    : db.collection('products').add(payload);

  promise.then(function () {
    showToast(productId ? 'Product updated' : 'Product added', 'success');
    closeModal();
  }).catch(function (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  });
}

/* ============================================================
   STOCK
   ============================================================ */
function getFilteredStockProducts() {
  var q = $('stock-search').value.trim().toLowerCase();
  var filter = $('stock-filter').value;
  return products.filter(function (p) {
    var stock = p.stock || 0;
    if (filter === 'low' && !(stock > 0 && stock < 5)) return false;
    if (filter === 'out' && stock !== 0) return false;
    if (q && (p.name + ' ' + p.sku).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function stockBadge(stock) {
  if (stock <= 0) return '<span class="badge" style="background:var(--cancelled-bg); color:var(--cancelled);">Out of stock</span>';
  if (stock < 5) return '<span class="badge" style="background:var(--amber-bg); color:var(--amber);">Low stock</span>';
  return '<span class="badge" style="background:var(--completed-bg); color:var(--completed);">In stock</span>';
}

function renderStockTable() {
  var list = getFilteredStockProducts();
  var body = $('stock-table-body');
  var emptyNote = $('stock-empty-note');

  if (!list.length) {
    body.innerHTML = '';
    emptyNote.style.display = 'block';
    return;
  }
  emptyNote.style.display = 'none';

  body.innerHTML = list.map(function (p) {
    var stock = p.stock || 0;
    return '<tr>'
      + '<td>' + escapeHtml(p.name) + '</td>'
      + '<td class="mono">' + escapeHtml(p.sku) + '</td>'
      + '<td>' + escapeHtml(p.color || '\u2014') + '</td>'
      + '<td class="num">' + stock + '</td>'
      + '<td>' + stockBadge(stock) + '</td>'
      + '<td><button class="btn btn-sm btn-ghost" data-action="adjust-stock" data-id="' + p.id + '">' + iconBoxes() + ' Adjust</button></td>'
      + '</tr>';
  }).join('');
}

$('stock-search').addEventListener('input', renderStockTable);
$('stock-filter').addEventListener('change', renderStockTable);

$('stock-table-body').addEventListener('click', function (e) {
  var btn = e.target.closest('[data-action="adjust-stock"]');
  if (btn) openStockAdjustModal(btn.getAttribute('data-id'));
});

function openStockAdjustModal(productId) {
  var p = products.find(function (x) { return x.id === productId; });
  if (!p) return;

  var html = '<h3>Adjust stock</h3>'
    + '<p class="panel-sub" style="margin-bottom:16px;">' + escapeHtml(p.name) + ' &middot; <span class="mono">' + escapeHtml(p.sku) + '</span> &middot; current stock: <strong>' + (p.stock || 0) + '</strong></p>'
    + '<div class="field"><label for="sm-delta">Adjustment (use a negative number to reduce stock)</label><input id="sm-delta" type="number" step="1" placeholder="e.g. 20 or -5"></div>'
    + '<div class="field"><label for="sm-reason">Reason (optional)</label><input id="sm-reason" type="text" placeholder="e.g. New stock arrived / Damaged goods"></div>'
    + '<div class="form-error" id="sm-error" style="display:none;"></div>'
    + '<div class="modal-actions">'
      + '<button class="btn btn-ghost" id="sm-cancel">Cancel</button>'
      + '<button class="btn btn-primary" id="sm-apply">Apply adjustment</button>'
    + '</div>';

  showModal(html);
  $('sm-cancel').addEventListener('click', closeModal);
  $('sm-apply').addEventListener('click', function () {
    var delta = parseInt($('sm-delta').value, 10);
    var errorBox = $('sm-error');
    if (isNaN(delta) || delta === 0) {
      errorBox.textContent = 'Enter a non-zero whole number.';
      errorBox.style.display = 'block';
      return;
    }
    var newStock = Math.max(0, (p.stock || 0) + delta);
    db.collection('products').doc(p.id).update({ stock: newStock }).then(function () {
      showToast('Stock updated to ' + newStock, 'success');
      closeModal();
    }).catch(function (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    });
  });
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports() {
  var now = new Date();
  var yesterday = startOfYesterday();

  var todays = orders.filter(function (o) { return isSameDay(o.createdAt, now); });
  var yesterdays = orders.filter(function (o) { return isSameDay(o.createdAt, yesterday); });
  var monthly = orders.filter(function (o) { return isSameMonth(o.createdAt, now); });

  var activeOrders = orders.filter(function (o) { return o.status !== 'Cancelled'; });
  var codAmount = activeOrders.filter(function (o) { return o.paymentType === 'COD'; })
    .reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
  var prepaidAmount = activeOrders.filter(function (o) { return o.paymentType === 'Prepaid'; })
    .reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
  var paymentPendingAmount = orders.filter(function (o) {
    return o.paymentType === 'COD' && o.status !== 'Completed' && o.status !== 'Cancelled';
  }).reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);

  var sum = function (list) { return list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0); };

  var cards = [
    { label: "Today's orders", value: todays.length + ' orders', sub: formatCurrency(sum(todays)) },
    { label: "Yesterday's orders", value: yesterdays.length + ' orders', sub: formatCurrency(sum(yesterdays)) },
    { label: 'Monthly orders', value: monthly.length + ' orders', sub: formatCurrency(sum(monthly)) },
    { label: 'COD amount', value: formatCurrency(codAmount), sub: 'All time, excludes cancelled' },
    { label: 'Prepaid amount', value: formatCurrency(prepaidAmount), sub: 'All time, excludes cancelled' },
    { label: 'Payment pending', value: formatCurrency(paymentPendingAmount), sub: 'COD, not yet completed' }
  ];

  $('reports-cards').innerHTML = cards.map(function (c) {
    return '<div class="metric-card">'
      + '<div class="metric-label">' + escapeHtml(c.label) + '</div>'
      + '<div class="metric-value" style="font-size:18px;">' + c.value + '</div>'
      + '<div style="font-size:11.5px; color:var(--text-faint); margin-top:6px;">' + c.sub + '</div>'
      + '</div>';
  }).join('');

  $('reports-month-label').textContent = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  $('reports-status-body').innerHTML = STATUSES.map(function (s) {
    var list = monthly.filter(function (o) { return o.status === s; });
    var meta = STATUS_META[s];
    return '<tr>'
      + '<td><span class="badge" style="background:' + meta.bg + '; color:' + meta.color + '">' + s + '</span></td>'
      + '<td class="num">' + list.length + '</td>'
      + '<td class="num">' + formatCurrency(sum(list)) + '</td>'
      + '</tr>';
  }).join('');
}

/* ============================================================
   DELETE CONFIRMATION (orders & products)
   ============================================================ */
function openDeleteConfirm(type, id) {
  var label = type === 'order' ? 'this order' : 'this product';
  if (type === 'order') {
    var o = orders.find(function (x) { return x.id === id; });
    if (o) label = 'order ' + orderCode(o.id) + ' for ' + o.customerName;
  } else {
    var p = products.find(function (x) { return x.id === id; });
    if (p) label = 'product "' + p.name + '"';
  }

  var html = '<h3>Delete ' + (type === 'order' ? 'order' : 'product') + '</h3>'
    + '<p style="font-size:13.5px; color:var(--text-muted); margin-bottom:18px;">Are you sure you want to delete ' + escapeHtml(label) + '? This action cannot be undone.</p>'
    + '<div class="modal-actions">'
      + '<button class="btn btn-ghost" id="dc-cancel">Cancel</button>'
      + '<button class="btn btn-danger" id="dc-confirm">Delete</button>'
    + '</div>';

  showModal(html);
  $('dc-cancel').addEventListener('click', closeModal);
  $('dc-confirm').addEventListener('click', function () {
    var collection = type === 'order' ? 'orders' : 'products';
    db.collection(collection).doc(id).delete().then(function () {
      showToast((type === 'order' ? 'Order' : 'Product') + ' deleted', 'success');
      closeModal();
    }).catch(function (err) {
      showToast('Could not delete: ' + err.message, 'error');
    });
  });
}
