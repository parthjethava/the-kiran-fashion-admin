// =========================================================
// THE KIRAN FASHION — Meesho Seller CRM
// Firebase v10 modular SDK · Vanilla JS ES Modules
// =========================================================

import { firebaseConfig, COLLECTIONS, BOOTSTRAP_ADMIN_EMAIL } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, query, orderBy, serverTimestamp, addDoc, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase init ─────────────────────────────────────────
const app        = initializeApp(firebaseConfig);
const auth       = getAuth(app);
const db         = getFirestore(app);
// Secondary app so admin can create users without being signed out
const secApp     = initializeApp(firebaseConfig, "Secondary");
const secAuth    = getAuth(secApp);

// ── Constants ─────────────────────────────────────────────
const ROLES = [
  { id: "admin",           label: "Admin" },
  { id: "order_manager",   label: "Order Manager" },
  { id: "stock_manager",   label: "Stock Manager" },
  { id: "product_manager", label: "Product Manager" },
];
const MODULES = ["users", "products", "orders", "stock"];
const ACTIONS = ["view", "create", "edit", "delete"];

const MEESHO_STATUSES = [
  "pending", "confirmed", "processing", "packed",
  "shipped", "out_for_delivery", "delivered", "returned", "cancelled",
];

const COURIER_PARTNERS = [
  "Meesho Logistics", "Delhivery", "Ecom Express", "Blue Dart",
  "DTDC", "Xpressbees", "Shadowfax", "Shiprocket", "Self Ship",
];

const PRODUCT_TYPES = ["Kurti", "Co-ord Set", "Saree", "Dupatta", "Lehenga", "Salwar Suit", "Top", "Dress", "Other"];
const FABRIC_TYPES  = ["Cotton", "Rayon", "Georgette", "Silk", "Polyester", "Chiffon", "Linen", "Crepe", "Other"];
const SIZES         = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Free Size"];

const LOW_STOCK_THRESHOLD_DEFAULT = 5;

// ── DOM helpers ───────────────────────────────────────────
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(str = "") {
  return String(str).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initials(name = "", email = "") {
  const src   = name?.trim() || email || "?";
  const parts = src.split(" ").filter(Boolean);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : src.slice(0, 2).toUpperCase();
}
function fmtMoney(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function slugify(str) {
  return str.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9\-]/g, "");
}
function autoSku(name, type) {
  const prefix = type ? type.slice(0, 3).toUpperCase() : "PRD";
  const slug   = slugify(name).slice(0, 6);
  const rand   = Math.floor(Math.random() * 900 + 100);
  return `KF-${prefix}-${slug}-${rand}`;
}

// ── Toasts ────────────────────────────────────────────────
function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>${esc(message)}`;
  $("#toastStack").appendChild(el);
  setTimeout(() => el.classList.add("toast-hide"), 3200);
  setTimeout(() => el.remove(), 3600);
}

// ── Modal ─────────────────────────────────────────────────
function openModal(html) {
  $("#modalBox").innerHTML = html;
  $("#modalRoot").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modalRoot").hidden = true;
  $("#modalBox").innerHTML = "";
  document.body.style.overflow = "";
}
$("#modalScrim").addEventListener("click", closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ── Permissions ───────────────────────────────────────────
function emptyPerms() {
  const p = {};
  MODULES.forEach(m => (p[m] = { view: false, create: false, edit: false, delete: false }));
  return p;
}
function defaultPermissions(role) {
  const p    = emptyPerms();
  const full = m => (p[m] = { view: true, create: true, edit: true, delete: true });
  if (role === "admin")           { MODULES.forEach(full); }
  if (role === "order_manager")   { full("orders"); p.products.view = true; p.stock.view = true; p.users.view = false; }
  if (role === "stock_manager")   { full("stock"); p.products.view = true; p.products.edit = true; p.users.view = false; }
  if (role === "product_manager") { full("products"); full("stock"); p.users.view = false; }
  return p;
}
function roleLabel(id) { return ROLES.find(r => r.id === id)?.label || id; }
function rolePillClass(id) {
  return { admin: "pill-gold", order_manager: "pill-rose", stock_manager: "pill-success", product_manager: "pill-slate" }[id] || "pill-slate";
}

// ── App state ─────────────────────────────────────────────
const state = {
  profile:     null,
  users:       [],
  products:    [],
  orders:      [],
  stock:       [],
  currentView: "dashboard",
  unsub:       [],
  orderSearch: "",
  productSearch: "",
};

function can(module, action) {
  if (!state.profile) return false;
  if (state.profile.role === "admin") return true;
  return !!state.profile.permissions?.[module]?.[action];
}

// ── Auth error helper ─────────────────────────────────────
function friendlyAuthError(err) {
  const c = err?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Incorrect email or password.";
  if (c.includes("too-many-requests"))  return "Too many attempts. Try again later.";
  if (c.includes("email-already-in"))  return "An account with this email already exists.";
  if (c.includes("weak-password"))     return "Password must be at least 6 characters.";
  if (c.includes("invalid-email"))     return "That email address looks invalid.";
  return err?.message || "Something went wrong. Please try again.";
}

// ── Login ─────────────────────────────────────────────────
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email    = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const btn      = $("#loginBtn");
  const errBox   = $("#loginError");
  errBox.hidden  = true;
  btn.disabled   = true;
  btn.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errBox.textContent = friendlyAuthError(err);
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

$("#forgotBtn").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) { toast("Enter your email above first.", "error"); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast("Password reset email sent.", "success");
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));

// ── Auth state ────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  teardownListeners();
  if (!user) {
    state.profile = null;
    $("#loginScreen").hidden = false;
    $("#app").hidden = true;
    return;
  }
  try {
    const profile = await loadOrBootstrapProfile(user);
    if (!profile) {
      toast("No account profile found. Contact your admin.", "error");
      await signOut(auth);
      return;
    }
    if (profile.status === "inactive") {
      toast("Your account has been deactivated.", "error");
      await signOut(auth);
      return;
    }
    state.profile = profile;
    $("#loginScreen").hidden = true;
    $("#app").hidden = false;
    renderShellForProfile();
    attachDataListeners();
    navigateTo("dashboard", true);
  } catch (err) {
    console.error(err);
    toast("Couldn't load your profile: " + (err.message || err), "error");
  }
});

async function loadOrBootstrapProfile(user) {
  const ref  = doc(db, COLLECTIONS.users, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { uid: user.uid, ...snap.data() };
  if (user.email === BOOTSTRAP_ADMIN_EMAIL) {
    const profile = {
      name: "Admin",
      email: user.email,
      role: "admin",
      permissions: defaultPermissions("admin"),
      status: "active",
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return { uid: user.uid, ...profile };
  }
  return null;
}

// ── Shell ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard",   icon: "◈", module: null },
  { id: "orders",    label: "Orders",      icon: "◉", module: "orders" },
  { id: "products",  label: "Products",    icon: "◧", module: "products" },
  { id: "stock",     label: "Stock",       icon: "◫", module: "stock" },
  { id: "users",     label: "Team",        icon: "◎", module: "users" },
];

function renderShellForProfile() {
  const p = state.profile;
  $("#userName").textContent     = p.name || p.email;
  $("#userAvatar").textContent   = initials(p.name, p.email);
  $("#topbarAvatar").textContent = initials(p.name, p.email);
  $("#userRoleBadge").textContent = roleLabel(p.role);

  const nav = $("#nav");
  nav.innerHTML = "";
  NAV_ITEMS.forEach(item => {
    if (item.module && !can(item.module, "view")) return;
    const btn = document.createElement("button");
    btn.className    = "nav-item";
    btn.dataset.view = item.id;
    btn.innerHTML    = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
    btn.addEventListener("click", () => { navigateTo(item.id); closeMobileNav(); });
    nav.appendChild(btn);
  });
}

function navigateTo(viewId, silent) {
  const item = NAV_ITEMS.find(n => n.id === viewId);
  if (item?.module && !can(item.module, "view")) viewId = "dashboard";
  state.currentView = viewId;
  $$(".view").forEach(v => (v.hidden = true));
  const target = $("#view-" + viewId);
  if (target) target.hidden = false;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  const label = NAV_ITEMS.find(n => n.id === viewId)?.label || "Dashboard";
  $("#topbarTitle").textContent = label;
  renderCurrentView();
  if (!silent) window.scrollTo(0, 0);
}

function renderCurrentView() {
  const v = state.currentView;
  if (v === "dashboard") renderDashboard();
  if (v === "orders")    renderOrdersTable();
  if (v === "products")  renderProductsTable();
  if (v === "stock")     renderStockTable();
  if (v === "users")     renderUsersTable();
}

// Mobile nav
$("#menuToggle").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#sidebarScrim").classList.add("open");
});
$("#sidebarScrim").addEventListener("click", closeMobileNav);
function closeMobileNav() {
  $("#sidebar").classList.remove("open");
  $("#sidebarScrim").classList.remove("open");
}

// ── Firestore listeners ───────────────────────────────────
function teardownListeners() {
  state.unsub.forEach(fn => fn());
  state.unsub = [];
}

function attachDataListeners() {
  if (can("users", "view")) {
    state.unsub.push(onSnapshot(
      collection(db, COLLECTIONS.users),
      snap => {
        state.users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        if (state.currentView === "users")     renderUsersTable();
        if (state.currentView === "dashboard") renderDashboard();
      },
      err => toast("Users sync error: " + err.message, "error")
    ));
  }
  if (can("products", "view")) {
    state.unsub.push(onSnapshot(
      collection(db, COLLECTIONS.products),
      snap => {
        state.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentView === "products")  renderProductsTable();
        if (state.currentView === "dashboard") renderDashboard();
        if (state.currentView === "stock")     renderStockTable();
      },
      err => toast("Products sync error: " + err.message, "error")
    ));
  }
  if (can("orders", "view")) {
    state.unsub.push(onSnapshot(
      collection(db, COLLECTIONS.orders),
      snap => {
        state.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentView === "orders")    renderOrdersTable();
        if (state.currentView === "dashboard") renderDashboard();
      },
      err => toast("Orders sync error: " + err.message, "error")
    ));
  }
  if (can("stock", "view")) {
    state.unsub.push(onSnapshot(
      collection(db, COLLECTIONS.stock),
      snap => {
        state.stock = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentView === "stock")     renderStockTable();
        if (state.currentView === "dashboard") renderDashboard();
        // Low stock alert
        const lowItems = state.stock.filter(s => Number(s.qty) > 0 && Number(s.qty) <= Number(s.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT));
        if (lowItems.length) {
          renderLowStockBadge(lowItems.length);
        } else {
          renderLowStockBadge(0);
        }
      },
      err => toast("Stock sync error: " + err.message, "error")
    ));
  }
}

function renderLowStockBadge(count) {
  $$(".nav-item").forEach(btn => {
    if (btn.dataset.view === "stock") {
      const existing = btn.querySelector(".nav-badge");
      if (count > 0) {
        if (existing) existing.textContent = count;
        else btn.insertAdjacentHTML("beforeend", `<span class="nav-badge">${count}</span>`);
      } else {
        if (existing) existing.remove();
      }
    }
  });
}

// ── Status pill ───────────────────────────────────────────
function statusPill(status) {
  const map = {
    pending:          "pill-warn",
    confirmed:        "pill-gold",
    processing:       "pill-gold",
    packed:           "pill-slate",
    shipped:          "pill-slate",
    out_for_delivery: "pill-slate",
    delivered:        "pill-success",
    returned:         "pill-rose",
    cancelled:        "pill-rose",
    active:           "pill-success",
    inactive:         "pill-rose",
    "in stock":       "pill-success",
    low:              "pill-warn",
    out:              "pill-rose",
  };
  const label = (status || "—").replace(/_/g, " ");
  return `<span class="pill ${map[status] || "pill-slate"}">${esc(label)}</span>`;
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────
function renderDashboard() {
  const orders      = state.orders;
  const todayMs     = new Date().setHours(0, 0, 0, 0);
  const todayOrders = orders.filter(o => (o.createdAtMs || 0) >= todayMs);
  const pending     = orders.filter(o => o.status === "pending").length;
  const shipped     = orders.filter(o => o.status === "shipped" || o.status === "out_for_delivery").length;
  const revenue     = orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.total || 0), 0);
  const lowStock    = state.stock.filter(s => Number(s.qty) <= Number(s.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT) && Number(s.qty) > 0);
  const outStock    = state.stock.filter(s => Number(s.qty) <= 0);

  const cards = [];
  if (can("orders", "view")) {
    cards.push(statCard("Today's Orders",  todayOrders.length, "orders placed today",    "◉"));
    cards.push(statCard("Pending",         pending,            "awaiting processing",    "◌"));
    cards.push(statCard("In Transit",      shipped,            "shipped / out for del.", "◈"));
    cards.push(statCard("Revenue",         fmtMoney(revenue),  "from delivered orders",  "◆"));
  }
  if (can("stock", "view")) {
    cards.push(statCard("Low Stock",  lowStock.length, "items below reorder level", "▲"));
    cards.push(statCard("Out of Stock", outStock.length, "items with 0 units",       "✕"));
  }
  if (can("products", "view")) cards.push(statCard("Products", state.products.length, "in catalogue", "◧"));
  if (can("users",    "view")) cards.push(statCard("Team",     state.users.length,    "active accounts", "◎"));

  const grid = $("#statGrid");
  grid.innerHTML = cards.join("") || `<p class="helper-text">No data to show yet.</p>`;

  // Low stock alert banner
  const alertEl = $("#lowStockAlert");
  if (alertEl) {
    if ((lowStock.length + outStock.length) > 0 && can("stock", "view")) {
      alertEl.hidden = false;
      alertEl.innerHTML = `
        <span class="alert-icon">▲</span>
        <span><strong>${lowStock.length} low</strong> and <strong>${outStock.length} out-of-stock</strong> items need attention.</span>
        <button class="btn btn-sm btn-ghost" onclick="window.navigateToStock()">View Stock →</button>`;
    } else {
      alertEl.hidden = true;
    }
  }

  // Recent orders table
  const panel = $("#dashRecentOrders")?.closest(".panel");
  if (!can("orders", "view")) {
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;
  const tbody = $("#dashRecentOrders tbody");
  const recent = [...orders]
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, 8);
  tbody.innerHTML = recent.length
    ? recent.map(o => `
      <tr>
        <td class="cell-strong cell-mono">${esc(o.meeshoOrderId || o.id.slice(-8).toUpperCase())}</td>
        <td>${esc(o.customerName || "—")}</td>
        <td>${esc(o.courier || "—")}</td>
        <td>${statusPill(o.status)}</td>
        <td>${fmtMoney(o.sellingPrice || o.total)}</td>
      </tr>`).join("")
    : `<tr class="empty-row"><td colspan="5">No orders yet.</td></tr>`;
}

window.navigateToStock = () => navigateTo("stock");

function statCard(label, value, sub, icon = "") {
  return `
    <div class="stat-card">
      <div class="stat-card-icon">${icon}</div>
      <span class="stat-label">${esc(label)}</span>
      <strong class="stat-value">${esc(String(value))}</strong>
      <span class="stat-sub">${esc(sub)}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────
// ORDERS — Meesho workflow
// ─────────────────────────────────────────────────────────
function renderOrdersTable() {
  if ($("#addOrderBtn")) $("#addOrderBtn").hidden = !can("orders", "create");

  const search = (state.orderSearch || "").toLowerCase();
  let rows = [...state.orders].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  if (search) {
    rows = rows.filter(o =>
      (o.meeshoOrderId || "").toLowerCase().includes(search) ||
      (o.customerName  || "").toLowerCase().includes(search) ||
      (o.productName   || "").toLowerCase().includes(search) ||
      (o.status        || "").toLowerCase().includes(search)
    );
  }

  const tbody = $("#ordersTable tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${search ? "No orders match your search." : "No orders yet — create your first Meesho order."}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(o => `
    <tr>
      <td class="cell-strong cell-mono">${esc(o.meeshoOrderId || o.id.slice(-8).toUpperCase())}</td>
      <td>
        <div class="cell-strong">${esc(o.customerName || "—")}</div>
        <div class="cell-sub">${esc(o.customerPhone || "")}</div>
      </td>
      <td>
        <div class="cell-strong">${esc(o.productName || "—")}</div>
        <div class="cell-sub cell-mono">${esc(o.sku || "")} ${o.size ? "· " + esc(o.size) : ""} ${o.color ? "· " + esc(o.color) : ""}</div>
      </td>
      <td>${esc(o.courier || "—")}</td>
      <td>${esc(o.awb || "—")}</td>
      <td>
        ${can("orders", "edit")
          ? `<select class="status-select ${statusSelectClass(o.status)}" data-status-order="${esc(o.id)}">
              ${MEESHO_STATUSES.map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
            </select>`
          : statusPill(o.status)}
      </td>
      <td class="cell-right">
        <div class="cell-strong">${fmtMoney(o.sellingPrice || o.total)}</div>
        <div class="cell-sub">${o.commission ? "Comm: " + fmtMoney(o.commission) : ""}</div>
      </td>
      <td class="cell-actions">
        ${can("orders", "edit")   ? `<button class="btn btn-ghost btn-sm" data-edit-order="${esc(o.id)}">Edit</button>` : ""}
        ${can("orders", "delete") ? `<button class="btn btn-danger btn-sm" data-del-order="${esc(o.id)}">✕</button>` : ""}
      </td>
    </tr>`).join("");

  $$("[data-status-order]", tbody).forEach(sel => sel.addEventListener("change", async () => {
    try {
      await updateDoc(doc(db, COLLECTIONS.orders, sel.dataset.statusOrder), {
        status: sel.value, updatedAt: serverTimestamp(),
      });
      toast("Order status updated.", "success");
    } catch (err) { toast(err.message, "error"); }
  }));

  $$("[data-edit-order]", tbody).forEach(b => b.addEventListener("click", () => openOrderModal(b.dataset.editOrder)));
  $$("[data-del-order]",  tbody).forEach(b => b.addEventListener("click", () => confirmDeleteOrder(b.dataset.delOrder)));
}

function statusSelectClass(status) {
  const map = {
    pending: "sel-warn", confirmed: "sel-gold", processing: "sel-gold",
    packed: "sel-slate", shipped: "sel-slate", out_for_delivery: "sel-slate",
    delivered: "sel-success", returned: "sel-rose", cancelled: "sel-rose",
  };
  return map[status] || "sel-slate";
}

// Wire search box
document.addEventListener("DOMContentLoaded", () => {
  const orderSearch = $("#orderSearch");
  if (orderSearch) orderSearch.addEventListener("input", e => {
    state.orderSearch = e.target.value;
    if (state.currentView === "orders") renderOrdersTable();
  });
  const productSearch = $("#productSearch");
  if (productSearch) productSearch.addEventListener("input", e => {
    state.productSearch = e.target.value;
    if (state.currentView === "products") renderProductsTable();
  });
});

if ($("#addOrderBtn")) $("#addOrderBtn").addEventListener("click", () => openOrderModal(null));

function openOrderModal(id) {
  const editing = !!id;
  const o = editing ? state.orders.find(x => x.id === id) : null;

  const productOptions = state.products.map(p => {
    const stock = state.stock.find(s => s.productId === p.id);
    return `<option value="${esc(p.id)}" data-name="${esc(p.name)}" data-sku="${esc(p.sku || "")}" data-price="${p.price || 0}" ${o?.productId === p.id ? "selected" : ""}>${esc(p.name)} (${esc(p.sku || "")}) — Stock: ${stock?.qty ?? "?"}</option>`;
  }).join("");

  openModal(`
    <div class="modal-head">
      <h3>${editing ? "Edit Order" : "New Meesho Order"}</h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <form class="modal-form" id="orderForm">
      <div class="form-section-title">Meesho Details</div>
      <div class="form-row">
        <label class="field"><span>Meesho Order ID</span>
          <input type="text" id="oMeeshoId" value="${esc(o?.meeshoOrderId || "")}" placeholder="e.g. 1234567890" /></label>
        <label class="field"><span>Order Date</span>
          <input type="date" id="oDate" value="${o?.orderDate || new Date().toISOString().slice(0,10)}" /></label>
      </div>

      <div class="form-section-title">Customer</div>
      <div class="form-row">
        <label class="field"><span>Customer Name *</span>
          <input type="text" id="oCustName" required value="${esc(o?.customerName || "")}" placeholder="e.g. Priya Sharma" /></label>
        <label class="field"><span>Phone</span>
          <input type="tel" id="oCustPhone" value="${esc(o?.customerPhone || "")}" placeholder="9876543210" /></label>
      </div>
      <label class="field"><span>Delivery Address</span>
        <textarea id="oAddress" rows="2" placeholder="Street, City, State, PIN">${esc(o?.address || "")}</textarea></label>

      <div class="form-section-title">Product</div>
      <label class="field"><span>Product *</span>
        <select id="oProductId" required>
          <option value="">— Select product —</option>
          ${productOptions}
        </select></label>
      <div class="form-row">
        <label class="field"><span>Size</span>
          <select id="oSize">
            <option value="">—</option>
            ${SIZES.map(s => `<option value="${s}" ${o?.size === s ? "selected" : ""}>${s}</option>`).join("")}
          </select></label>
        <label class="field"><span>Colour / Variant</span>
          <input type="text" id="oColor" value="${esc(o?.color || "")}" placeholder="e.g. Red, Blue" /></label>
        <label class="field"><span>Qty *</span>
          <input type="number" id="oQty" min="1" value="${o?.qty || 1}" required /></label>
      </div>

      <div class="form-section-title">Pricing</div>
      <div class="form-row">
        <label class="field"><span>Selling Price (₹) *</span>
          <input type="number" id="oSellingPrice" min="0" required value="${o?.sellingPrice || ""}" placeholder="Amount customer pays" /></label>
        <label class="field"><span>Meesho Commission (₹)</span>
          <input type="number" id="oCommission" min="0" value="${o?.commission || ""}" placeholder="0" /></label>
      </div>

      <div class="form-section-title">Logistics</div>
      <div class="form-row">
        <label class="field"><span>Courier Partner</span>
          <select id="oCourier">
            <option value="">— Select courier —</option>
            ${COURIER_PARTNERS.map(c => `<option value="${esc(c)}" ${o?.courier === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
          </select></label>
        <label class="field"><span>AWB / Tracking No.</span>
          <input type="text" id="oAwb" value="${esc(o?.awb || "")}" placeholder="Tracking number" /></label>
      </div>
      <label class="field"><span>Status *</span>
        <select id="oStatus">
          ${MEESHO_STATUSES.map(s => `<option value="${s}" ${(o?.status || "pending") === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
        </select></label>
      <label class="field"><span>Notes</span>
        <textarea id="oNotes" rows="2" placeholder="Internal notes…">${esc(o?.notes || "")}</textarea></label>

      <p id="orderFormError" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="oSave">${editing ? "Save Changes" : "Create Order"}</button>
      </div>
    </form>
  `);

  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);

  // Auto-fill selling price from product selection
  $("#oProductId").addEventListener("change", e => {
    const opt = e.target.selectedOptions[0];
    if (opt?.dataset.price && !$("#oSellingPrice").value) {
      $("#oSellingPrice").value = opt.dataset.price;
    }
  });

  $("#orderForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#oSave");
    const errEl = $("#orderFormError");
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Saving…";

    const productId   = $("#oProductId").value;
    const qty         = Number($("#oQty").value || 1);
    const status      = $("#oStatus").value;
    const productOpt  = $("#oProductId").selectedOptions[0];
    const productName = productOpt?.dataset.name || "";
    const sku         = productOpt?.dataset.sku || "";

    // Stock check for new orders
    if (!editing && productId) {
      const stockEntry = state.stock.find(s => s.productId === productId);
      if (stockEntry && Number(stockEntry.qty) < qty) {
        errEl.textContent = `Insufficient stock. Available: ${stockEntry.qty} unit(s).`;
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = "Create Order";
        return;
      }
    }

    const payload = {
      meeshoOrderId: $("#oMeeshoId").value.trim(),
      orderDate:     $("#oDate").value,
      customerName:  $("#oCustName").value.trim(),
      customerPhone: $("#oCustPhone").value.trim(),
      address:       $("#oAddress").value.trim(),
      productId,
      productName,
      sku,
      size:          $("#oSize").value,
      color:         $("#oColor").value.trim(),
      qty,
      sellingPrice:  Number($("#oSellingPrice").value || 0),
      commission:    Number($("#oCommission").value || 0),
      total:         Number($("#oSellingPrice").value || 0),
      courier:       $("#oCourier").value,
      awb:           $("#oAwb").value.trim(),
      status,
      notes:         $("#oNotes").value.trim(),
      updatedAt:     serverTimestamp(),
    };

    try {
      if (editing) {
        await updateDoc(doc(db, COLLECTIONS.orders, id), payload);
        toast("Order updated.", "success");
      } else {
        payload.createdAt   = serverTimestamp();
        payload.createdAtMs = Date.now();
        await addDoc(collection(db, COLLECTIONS.orders), payload);

        // Auto-deduct stock after order creation
        if (productId) {
          const stockEntry = state.stock.find(s => s.productId === productId);
          if (stockEntry) {
            const newQty = Math.max(0, Number(stockEntry.qty) - qty);
            await updateDoc(doc(db, COLLECTIONS.stock, stockEntry.id), {
              qty: newQty, updatedAt: serverTimestamp(),
            });
            if (newQty <= Number(stockEntry.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT)) {
              toast(`⚠ Low stock alert: ${productName} has only ${newQty} units left.`, "error");
            } else {
              toast(`Order created. Stock updated: ${productName} → ${newQty} units.`, "success");
            }
          }
        } else {
          toast("Order created.", "success");
        }
      }
      closeModal();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = editing ? "Save Changes" : "Create Order";
    }
  });
}

function confirmDeleteOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  openModal(`
    <div class="modal-head"><h3>Delete Order?</h3><button class="modal-close" id="mClose">✕</button></div>
    <p style="font-size:14px;line-height:1.6;margin-bottom:18px;">
      Delete <strong>${esc(o.meeshoOrderId || id.slice(-8).toUpperCase())}</strong> for <strong>${esc(o.customerName)}</strong>?
      This won't restore any deducted stock automatically.
    </p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
      <button type="button" class="btn btn-danger" id="mConfirm">Delete Order</button>
    </div>
  `);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);
  $("#mConfirm").addEventListener("click", async () => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.orders, id));
      toast("Order deleted.", "success");
      closeModal();
    } catch (err) { toast(err.message, "error"); }
  });
}

// ─────────────────────────────────────────────────────────
// PRODUCTS — Kurti & Co-ord Set focused
// ─────────────────────────────────────────────────────────
function renderProductsTable() {
  if ($("#addProductBtn")) $("#addProductBtn").hidden = !can("products", "create");

  const search = (state.productSearch || "").toLowerCase();
  let rows = [...state.products].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  if (search) {
    rows = rows.filter(p =>
      (p.name     || "").toLowerCase().includes(search) ||
      (p.sku      || "").toLowerCase().includes(search) ||
      (p.type     || "").toLowerCase().includes(search) ||
      (p.category || "").toLowerCase().includes(search)
    );
  }

  const tbody = $("#productsTable tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">${search ? "No products match your search." : "No products yet — add your first item."}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const stock   = state.stock.find(s => s.productId === p.id);
    const qty     = stock?.qty ?? "—";
    const stockStatus = stock
      ? (Number(stock.qty) <= 0 ? "out" : Number(stock.qty) <= Number(stock.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT) ? "low" : "in stock")
      : "—";
    return `
    <tr>
      <td>
        <div class="cell-strong">${esc(p.name)}</div>
        <div class="cell-sub">${esc(p.type || "")} ${p.fabric ? "· " + esc(p.fabric) : ""}</div>
      </td>
      <td class="cell-mono">${esc(p.sku || "—")}</td>
      <td>${esc(p.category || "—")}</td>
      <td>${esc((p.sizes || []).join(", ") || "—")}</td>
      <td>${fmtMoney(p.mrp)} <span class="cell-sub">MRP</span><br>${fmtMoney(p.price)} <span class="cell-sub">SP</span></td>
      <td>${qty !== "—" ? qty : "—"}</td>
      <td>${stock ? statusPill(stockStatus) : "—"}</td>
      <td class="cell-actions">
        ${can("products", "edit")   ? `<button class="btn btn-ghost btn-sm" data-edit-product="${esc(p.id)}">Edit</button>` : ""}
        ${can("products", "delete") ? `<button class="btn btn-danger btn-sm" data-del-product="${esc(p.id)}">✕</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  $$("[data-edit-product]",  tbody).forEach(b => b.addEventListener("click", () => openProductModal(b.dataset.editProduct)));
  $$("[data-del-product]",   tbody).forEach(b => b.addEventListener("click", () => confirmDeleteProduct(b.dataset.delProduct)));
}

if ($("#addProductBtn")) $("#addProductBtn").addEventListener("click", () => openProductModal(null));

function openProductModal(id) {
  const editing = !!id;
  const p = editing ? state.products.find(x => x.id === id) : null;
  const stockEntry = editing ? state.stock.find(s => s.productId === id) : null;

  openModal(`
    <div class="modal-head">
      <h3>${editing ? "Edit Product" : "New Product"}</h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <form class="modal-form" id="productForm">
      <div class="form-section-title">Basic Info</div>
      <label class="field"><span>Product Name *</span>
        <input type="text" id="pName" required value="${esc(p?.name || "")}" placeholder="e.g. Floral Print Kurti Set" /></label>
      <div class="form-row">
        <label class="field"><span>Type</span>
          <select id="pType">
            ${PRODUCT_TYPES.map(t => `<option value="${t}" ${p?.type === t ? "selected" : ""}>${t}</option>`).join("")}
          </select></label>
        <label class="field"><span>Fabric</span>
          <select id="pFabric">
            ${FABRIC_TYPES.map(f => `<option value="${f}" ${p?.fabric === f ? "selected" : ""}>${f}</option>`).join("")}
          </select></label>
      </div>
      <label class="field"><span>Category / Collection</span>
        <input type="text" id="pCategory" value="${esc(p?.category || "")}" placeholder="e.g. Summer 2025" /></label>

      <div class="form-section-title">SKU & Sizes</div>
      <div class="form-row">
        <label class="field"><span>SKU *</span>
          <input type="text" id="pSku" required value="${esc(p?.sku || "")}" placeholder="KF-KUR-001" /></label>
        <label class="field"><span>Meesho Product ID</span>
          <input type="text" id="pMeeshoId" value="${esc(p?.meeshoProductId || "")}" placeholder="Optional" /></label>
      </div>
      <div class="field">
        <span>Available Sizes</span>
        <div class="size-checks">
          ${SIZES.map(s => `<label class="size-chip ${(p?.sizes || []).includes(s) ? "size-chip-on" : ""}">
            <input type="checkbox" class="size-cb" value="${s}" ${(p?.sizes || []).includes(s) ? "checked" : ""} />${s}</label>`).join("")}
        </div>
      </div>
      <label class="field"><span>Colours / Variants</span>
        <input type="text" id="pColors" value="${esc((p?.colors || []).join(", "))}" placeholder="Red, Blue, Green" /></label>

      <div class="form-section-title">Pricing</div>
      <div class="form-row">
        <label class="field"><span>MRP (₹)</span>
          <input type="number" min="0" id="pMrp" value="${p?.mrp ?? ""}" placeholder="Maximum Retail Price" /></label>
        <label class="field"><span>Selling Price (₹) *</span>
          <input type="number" min="0" id="pPrice" required value="${p?.price ?? ""}" placeholder="Your price on Meesho" /></label>
        <label class="field"><span>Cost Price (₹)</span>
          <input type="number" min="0" id="pCost" value="${p?.costPrice ?? ""}" placeholder="Your manufacturing cost" /></label>
      </div>

      <div class="form-section-title">Stock</div>
      <div class="form-row">
        <label class="field"><span>${editing ? "Current Stock" : "Opening Stock"}</span>
          <input type="number" min="0" id="pStock" value="${stockEntry?.qty ?? 0}" ${editing && !can("stock","edit") ? "disabled" : ""} /></label>
        <label class="field"><span>Reorder At (units)</span>
          <input type="number" min="0" id="pReorder" value="${stockEntry?.reorderAt ?? LOW_STOCK_THRESHOLD_DEFAULT}" /></label>
      </div>

      <label class="field"><span>Description / Notes</span>
        <textarea id="pDesc" rows="2" placeholder="Fabric details, wash care, Meesho listing notes…">${esc(p?.description || "")}</textarea></label>

      <p id="productFormError" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="pSave">${editing ? "Save Changes" : "Add Product"}</button>
      </div>
    </form>
  `);

  // Auto-generate SKU
  const autoSkuHandler = () => {
    const name = $("#pName").value;
    const type = $("#pType").value;
    if (name && !editing && !$("#pSku").value) {
      $("#pSku").value = autoSku(name, type);
    }
  };
  $("#pName").addEventListener("blur", autoSkuHandler);

  // Toggle size chip styling
  $$(".size-cb").forEach(cb => {
    cb.addEventListener("change", e => {
      e.target.closest(".size-chip").classList.toggle("size-chip-on", e.target.checked);
    });
  });

  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);

  $("#productForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn   = $("#pSave");
    const errEl = $("#productFormError");
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Saving…";

    const sizes  = $$(".size-cb:checked").map(cb => cb.value);
    const colors = $("#pColors").value.split(",").map(c => c.trim()).filter(Boolean);

    const payload = {
      name:            $("#pName").value.trim(),
      type:            $("#pType").value,
      fabric:          $("#pFabric").value,
      category:        $("#pCategory").value.trim(),
      sku:             $("#pSku").value.trim(),
      meeshoProductId: $("#pMeeshoId").value.trim(),
      sizes,
      colors,
      mrp:             Number($("#pMrp").value || 0),
      price:           Number($("#pPrice").value || 0),
      costPrice:       Number($("#pCost").value || 0),
      description:     $("#pDesc").value.trim(),
      updatedAt:       serverTimestamp(),
    };

    const stockQty     = Number($("#pStock").value   || 0);
    const reorderAt    = Number($("#pReorder").value || LOW_STOCK_THRESHOLD_DEFAULT);

    try {
      if (editing) {
        await updateDoc(doc(db, COLLECTIONS.products, id), payload);
        if (can("stock", "edit") && stockEntry) {
          await updateDoc(doc(db, COLLECTIONS.stock, stockEntry.id), {
            qty: stockQty, reorderAt, productName: payload.name, sku: payload.sku, updatedAt: serverTimestamp(),
          });
        }
        toast("Product updated.", "success");
      } else {
        payload.createdAt   = serverTimestamp();
        payload.createdAtMs = Date.now();
        const ref = await addDoc(collection(db, COLLECTIONS.products), payload);
        await setDoc(doc(db, COLLECTIONS.stock, ref.id), {
          productId: ref.id, productName: payload.name, sku: payload.sku,
          qty: stockQty, reorderAt, updatedAt: serverTimestamp(),
        });
        toast("Product added with stock entry.", "success");
      }
      closeModal();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = editing ? "Save Changes" : "Add Product";
    }
  });
}

function confirmDeleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <div class="modal-head"><h3>Delete Product?</h3><button class="modal-close" id="mClose">✕</button></div>
    <p style="font-size:14px;line-height:1.6;margin-bottom:18px;">
      Delete <strong>${esc(p.name)}</strong> (${esc(p.sku || "")})?
      Its stock entry will also be removed. Orders referencing it won't be deleted.
    </p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
      <button type="button" class="btn btn-danger" id="mConfirm">Delete Product</button>
    </div>
  `);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);
  $("#mConfirm").addEventListener("click", async () => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, COLLECTIONS.products, id));
      const stockEntry = state.stock.find(s => s.productId === id);
      if (stockEntry) batch.delete(doc(db, COLLECTIONS.stock, stockEntry.id));
      await batch.commit();
      toast("Product and stock entry deleted.", "success");
      closeModal();
    } catch (err) { toast(err.message, "error"); }
  });
}

// ─────────────────────────────────────────────────────────
// STOCK
// ─────────────────────────────────────────────────────────
function renderStockTable() {
  const rows = [...state.stock].sort((a, b) => {
    const aLow = Number(a.qty) <= Number(a.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT);
    const bLow = Number(b.qty) <= Number(b.reorderAt || LOW_STOCK_THRESHOLD_DEFAULT);
    return bLow - aLow || (a.productName || "").localeCompare(b.productName || "");
  });

  const tbody = $("#stockTable tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No stock entries yet — add a product first.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const qty      = Number(s.qty ?? 0);
    const reorder  = Number(s.reorderAt ?? LOW_STOCK_THRESHOLD_DEFAULT);
    const status   = qty <= 0 ? "out" : qty <= reorder ? "low" : "in stock";
    const product  = state.products.find(p => p.id === s.productId);
    return `
    <tr class="${status === "out" ? "row-danger" : status === "low" ? "row-warn" : ""}">
      <td>
        <div class="cell-strong">${esc(s.productName || "—")}</div>
        <div class="cell-sub">${esc(product?.type || "")} ${product?.fabric ? "· " + esc(product.fabric) : ""}</div>
      </td>
      <td class="cell-mono">${esc(s.sku || "—")}</td>
      <td class="cell-right">
        ${can("stock", "edit")
          ? `<input type="number" min="0" class="qty-input" data-qty-stock="${esc(s.id)}" value="${qty}" />`
          : `<strong>${qty}</strong>`}
      </td>
      <td class="cell-right">
        ${can("stock", "edit")
          ? `<input type="number" min="0" class="qty-input" data-reorder-stock="${esc(s.id)}" value="${reorder}" />`
          : reorder}
      </td>
      <td>${statusPill(status)}</td>
      <td>${fmtDate(s.updatedAt)}</td>
      <td class="cell-actions">
        ${can("stock", "edit") ? `<button class="btn btn-ghost btn-sm" data-save-stock="${esc(s.id)}">Save</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  $$("[data-save-stock]", tbody).forEach(b => b.addEventListener("click", async () => {
    const sid      = b.dataset.saveStock;
    const qty      = Number($(`[data-qty-stock="${sid}"]`)?.value ?? 0);
    const reorderAt = Number($(`[data-reorder-stock="${sid}"]`)?.value ?? LOW_STOCK_THRESHOLD_DEFAULT);
    try {
      await updateDoc(doc(db, COLLECTIONS.stock, sid), { qty, reorderAt, updatedAt: serverTimestamp() });
      if (qty <= 0)         toast("Marked as out of stock.", "error");
      else if (qty <= reorderAt) toast(`Low stock warning: only ${qty} units left.`, "error");
      else                   toast("Stock updated.", "success");
    } catch (err) { toast(err.message, "error"); }
  }));
}

// ─────────────────────────────────────────────────────────
// USERS (Admin only)
// ─────────────────────────────────────────────────────────
function renderUsersTable() {
  if ($("#addUserBtn")) $("#addUserBtn").hidden = !can("users", "create");

  const tbody = $("#usersTable tbody");
  if (!state.users.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No team members yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="avatar avatar-sm">${initials(u.name, u.email)}</div>
          <div>
            <div class="cell-strong">${esc(u.name || "—")}</div>
            <div class="cell-sub">${esc(u.email || "—")}</div>
          </div>
        </div>
      </td>
      <td><span class="pill ${rolePillClass(u.role)}">${esc(roleLabel(u.role))}</span></td>
      <td>${statusPill(u.status)}</td>
      <td>${permChips(u.permissions)}</td>
      <td>${fmtDate(u.createdAt)}</td>
      <td class="cell-actions">
        ${can("users", "edit")   ? `<button class="btn btn-ghost btn-sm" data-edit-user="${esc(u.uid)}">Edit</button>` : ""}
        ${can("users", "delete") && u.uid !== state.profile?.uid ? `<button class="btn btn-danger btn-sm" data-del-user="${esc(u.uid)}">✕</button>` : ""}
      </td>
    </tr>`).join("");

  $$("[data-edit-user]", tbody).forEach(b => b.addEventListener("click", () => openUserModal(b.dataset.editUser)));
  $$("[data-del-user]",  tbody).forEach(b => b.addEventListener("click", () => confirmDeleteUser(b.dataset.delUser)));
}

function permChips(permissions) {
  if (!permissions) return "—";
  const chips = MODULES.filter(m => permissions[m]?.view)
    .map(m => `<span class="perm-chip">${m}</span>`);
  return chips.length ? `<div class="perm-chips">${chips.join("")}</div>` : "—";
}

if ($("#addUserBtn")) $("#addUserBtn").addEventListener("click", () => openUserModal(null));

function openUserModal(uid) {
  const editing = !!uid;
  const u    = editing ? state.users.find(x => x.uid === uid) : null;
  const role = u?.role || "order_manager";
  const perms = u?.permissions || defaultPermissions(role);

  openModal(`
    <div class="modal-head">
      <h3>${editing ? "Edit Team Member" : "Add Team Member"}</h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <form class="modal-form" id="userForm">
      <div class="form-row">
        <label class="field"><span>Full Name *</span>
          <input type="text" id="uName" required value="${esc(u?.name || "")}" placeholder="e.g. Priya Shah" /></label>
        <label class="field"><span>Email *</span>
          <input type="email" id="uEmail" required ${editing ? "disabled" : ""} value="${esc(u?.email || "")}" placeholder="staff@kiranfashion.com" /></label>
      </div>
      ${editing
        ? `<p class="helper-text">Email can't be changed here. Use password reset for lockouts.</p>`
        : `<label class="field"><span>Temporary Password *</span>
            <input type="password" id="uPassword" required minlength="6" placeholder="Minimum 6 characters" /></label>`}
      <div class="form-row">
        <label class="field"><span>Role *</span>
          <select id="uRole">
            ${ROLES.map(r => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${r.label}</option>`).join("")}
          </select></label>
        ${editing ? `
        <label class="field"><span>Status</span>
          <select id="uStatus">
            <option value="active"   ${u?.status !== "inactive" ? "selected" : ""}>Active</option>
            <option value="inactive" ${u?.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select></label>` : ""}
      </div>

      <div>
        <p class="helper-text" style="margin-bottom:8px;">Permissions — role fills defaults; customise below.</p>
        <div id="permBlock"></div>
      </div>

      <p id="userFormError" class="form-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="uSave">${editing ? "Save Changes" : "Create Account"}</button>
      </div>
    </form>
  `);

  const permBlock = $("#permBlock");
  function paintPerms(p) { permBlock.innerHTML = permissionGrid(p); }
  paintPerms(perms);
  $("#uRole").addEventListener("change", e => paintPerms(defaultPermissions(e.target.value)));
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);

  $("#userForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn   = $("#uSave");
    const errEl = $("#userFormError");
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const name        = $("#uName").value.trim();
      const roleVal     = $("#uRole").value;
      const permissions = readPermissionGrid();

      if (editing) {
        const statusVal = $("#uStatus").value;
        await updateDoc(doc(db, COLLECTIONS.users, uid), { name, role: roleVal, permissions, status: statusVal, updatedAt: serverTimestamp() });
        toast("Team member updated.", "success");
      } else {
        const email    = $("#uEmail").value.trim();
        const password = $("#uPassword").value;
        const cred     = await createUserWithEmailAndPassword(secAuth, email, password);
        await setDoc(doc(db, COLLECTIONS.users, cred.user.uid), {
          name, email, role: roleVal, permissions, status: "active",
          createdAt: serverTimestamp(),
        });
        await signOut(secAuth);
        toast("Team member created.", "success");
      }
      closeModal();
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = editing ? "Save Changes" : "Create Account";
    }
  });
}

function permissionGrid(p) {
  return MODULES.map(m => `
    <div class="perm-group">
      <div class="perm-group-title">${m}</div>
      <div class="checkbox-grid">
        ${ACTIONS.map(a => `
          <label class="checkbox-row">
            <input type="checkbox" data-perm-mod="${m}" data-perm-action="${a}" ${p[m]?.[a] ? "checked" : ""} />${a}
          </label>`).join("")}
      </div>
    </div>`).join("");
}

function readPermissionGrid() {
  const p = emptyPerms();
  $$("[data-perm-mod]").forEach(cb => { p[cb.dataset.permMod][cb.dataset.permAction] = cb.checked; });
  return p;
}

function confirmDeleteUser(uid) {
  const u = state.users.find(x => x.uid === uid);
  if (!u) return;
  openModal(`
    <div class="modal-head"><h3>Remove Team Member?</h3><button class="modal-close" id="mClose">✕</button></div>
    <p style="font-size:14px;line-height:1.6;margin-bottom:18px;">
      Remove <strong>${esc(u.name || u.email)}</strong>? Their Firestore profile is deleted immediately.
      Remove them from Firebase Authentication → Users in the console too to fully revoke login.
    </p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
      <button type="button" class="btn btn-danger" id="mConfirm">Remove</button>
    </div>
  `);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);
  $("#mConfirm").addEventListener("click", async () => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.users, uid));
      toast("Team member removed.", "success");
      closeModal();
    } catch (err) { toast(err.message, "error"); }
  });
}

// Hash-based deep-linking
window.addEventListener("hashchange", () => {
  const id = location.hash.replace("#", "");
  if (id && NAV_ITEMS.some(n => n.id === id)) navigateTo(id);
});
