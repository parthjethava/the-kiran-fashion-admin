// =========================================================
// THE KIRAN FASHION — Admin Console
// Vanilla JS + Firebase v10 modular SDK (via CDN, ES modules)
// =========================================================

import { firebaseConfig, COLLECTIONS, BOOTSTRAP_ADMIN_EMAIL } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, query, orderBy, serverTimestamp, addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------------------------------------
   Firebase init — a secondary app instance lets an admin
   create a new staff account without being signed out of
   their own session (createUser normally swaps the session
   to the new user, which we don't want here).
--------------------------------------------------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

/* ---------------------------------------------------------
   Roles & permissions
--------------------------------------------------------- */
const ROLES = [
  { id: "admin", label: "Admin" },
  { id: "order_manager", label: "Order Manager" },
  { id: "stock_manager", label: "Stock Manager" },
  { id: "product_manager", label: "Product Manager" },
];
const MODULES = ["users", "products", "orders", "stock"];
const ACTIONS = ["view", "create", "edit", "delete"];

function emptyPerms() {
  const p = {};
  MODULES.forEach((m) => (p[m] = { view: false, create: false, edit: false, delete: false }));
  return p;
}
function defaultPermissions(role) {
  const p = emptyPerms();
  const allOn = (m) => (p[m] = { view: true, create: true, edit: true, delete: true });
  if (role === "admin") MODULES.forEach(allOn);
  if (role === "order_manager") { allOn("orders"); p.products.view = true; p.stock.view = true; }
  if (role === "stock_manager") { allOn("stock"); p.products.view = true; }
  if (role === "product_manager") { allOn("products"); p.stock.view = true; }
  return p;
}
function roleLabel(id) { return ROLES.find((r) => r.id === id)?.label || id; }

/* ---------------------------------------------------------
   Small DOM / UX helpers
--------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function initials(name = "", email = "") {
  const src = name?.trim() || email || "?";
  const parts = src.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
function fmtMoney(n) {
  const v = Number(n || 0);
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function toast(message, type = "info") {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast-error" : type === "success" ? " toast-success" : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function openModal(innerHtml) {
  $("#modalBox").innerHTML = innerHtml;
  $("#modalRoot").hidden = false;
}
function closeModal() {
  $("#modalRoot").hidden = true;
  $("#modalBox").innerHTML = "";
}
$("#modalScrim").addEventListener("click", closeModal);

/* ---------------------------------------------------------
   App state
--------------------------------------------------------- */
const state = {
  profile: null,       // {uid,email,name,role,permissions,status}
  users: [],
  products: [],
  orders: [],
  stock: [],
  currentView: "dashboard",
  unsub: [],            // active onSnapshot unsubscribers
};

function can(module, action) {
  if (!state.profile) return false;
  if (state.profile.role === "admin") return true;
  return !!state.profile.permissions?.[module]?.[action];
}

/* ---------------------------------------------------------
   Auth: login / logout / forgot password
--------------------------------------------------------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const btn = $("#loginBtn");
  const errBox = $("#loginError");
  errBox.hidden = true;
  btn.disabled = true;
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

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Try again later.";
  if (code.includes("invalid-email")) return "That email address looks invalid.";
  return err?.message || "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------
   Auth state → load profile → boot / teardown app
--------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
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
  toast("Your account has no profile. Contact an admin.", "error");
  await signOut(auth);
  return;
}

onAuthStateChanged(auth, async (user) => {
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
      toast("Your account has no profile. Contact an admin.", "error");
      await signOut(auth);
      return;
    }

    if (profile.status === "inactive") {
      toast("This account has been deactivated.", "error");
      await signOut(auth);
      return;
    }

    state.profile = profile;
    $("#loginScreen").hidden = true;
    $("#app").hidden = false;

    renderShellForProfile();
    attachDataListeners();
    navigateTo(defaultViewFor(profile), true);

  } catch (err) {
    console.error(err);
    toast("Couldn't load your profile: " + (err.message || err), "error");
  }
});
    state.profile = profile;
    $("#loginScreen").hidden = true;
    $("#app").hidden = false;
    renderShellForProfile();
    attachDataListeners();
    navigateTo(defaultViewFor(profile), true);
  } catch (err) {
    console.error(err);
    toast("Couldn't load your profile: " + (err.message || err), "error");
  }
});

async function loadOrBootstrapProfile(user) {
  const ref = doc(db, COLLECTIONS.users, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { uid: user.uid, ...snap.data() };

  // No profile yet. If this is the designated bootstrap admin email,
  // create their admin profile automatically so there's always a way in.
  if (user.email === BOOTSTRAP_ADMIN_EMAIL) {
    const profile = {
      name: user.email.split("@")[0],
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

function defaultViewFor(profile) {
  if (can("orders", "view") || profile.role === "order_manager") return "dashboard";
  return "dashboard";
}

/* ---------------------------------------------------------
   Shell rendering: sidebar nav, user card, view guards
--------------------------------------------------------- */
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", module: null },
  { id: "orders", label: "Orders", module: "orders" },
  { id: "stock", label: "Stock", module: "stock" },
  { id: "products", label: "Products", module: "products" },
  { id: "users", label: "Users", module: "users" },
];

function renderShellForProfile() {
  const p = state.profile;
  $("#userName").textContent = p.name || p.email;
  $("#userAvatar").textContent = initials(p.name, p.email);
  $("#topbarAvatar").textContent = initials(p.name, p.email);
  $("#userRoleBadge").textContent = roleLabel(p.role);

  const nav = $("#nav");
  nav.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    if (item.module && !can(item.module, "view")) return;
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.view = item.id;
    btn.innerHTML = `<span class="dot"></span><span>${item.label}</span>`;
    btn.addEventListener("click", () => { navigateTo(item.id); closeMobileNav(); });
    nav.appendChild(btn);
  });
}

function navigateTo(viewId, silent) {
  const item = NAV_ITEMS.find((n) => n.id === viewId);
  if (item?.module && !can(item.module, "view")) viewId = "dashboard";
  state.currentView = viewId;

  $$(".view").forEach((v) => (v.hidden = true));
  const target = $("#view-" + viewId);
  if (target) target.hidden = false;

  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  const label = NAV_ITEMS.find((n) => n.id === viewId)?.label || "Dashboard";
  $("#topbarTitle").textContent = label;

  renderCurrentView();
  if (!silent) window.scrollTo(0, 0);
}

function renderCurrentView() {
  if (state.currentView === "dashboard") renderDashboard();
  if (state.currentView === "users") renderUsersTable();
  if (state.currentView === "products") renderProductsTable();
  if (state.currentView === "orders") renderOrdersTable();
  if (state.currentView === "stock") renderStockTable();
}

/* Mobile nav toggle */
$("#menuToggle").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#sidebarScrim").classList.add("open");
});
$("#sidebarScrim").addEventListener("click", closeMobileNav);
function closeMobileNav() {
  $("#sidebar").classList.remove("open");
  $("#sidebarScrim").classList.remove("open");
}

/* ---------------------------------------------------------
   Firestore listeners
--------------------------------------------------------- */
function teardownListeners() {
  state.unsub.forEach((fn) => fn());
  state.unsub = [];
}

function attachDataListeners() {
  if (can("users", "view")) {
    const q = query(collection(db, COLLECTIONS.users));
    state.unsub.push(onSnapshot(q, (snap) => {
      state.users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      if (state.currentView === "users") renderUsersTable();
      if (state.currentView === "dashboard") renderDashboard();
    }, (err) => toast("Users: " + err.message, "error")));
  }
  if (can("products", "view")) {
    const q = query(collection(db, COLLECTIONS.products));
    state.unsub.push(onSnapshot(q, (snap) => {
      state.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (state.currentView === "products") renderProductsTable();
      if (state.currentView === "dashboard") renderDashboard();
      if (state.currentView === "stock") renderStockTable();
    }, (err) => toast("Products: " + err.message, "error")));
  }
  if (can("orders", "view")) {
    const q = query(collection(db, COLLECTIONS.orders));
    state.unsub.push(onSnapshot(q, (snap) => {
      state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (state.currentView === "orders") renderOrdersTable();
      if (state.currentView === "dashboard") renderDashboard();
    }, (err) => toast("Orders: " + err.message, "error")));
  }
  if (can("stock", "view")) {
    const q = query(collection(db, COLLECTIONS.stock));
    state.unsub.push(onSnapshot(q, (snap) => {
      state.stock = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (state.currentView === "stock") renderStockTable();
      if (state.currentView === "dashboard") renderDashboard();
    }, (err) => toast("Stock: " + err.message, "error")));
  }
}

/* ---------------------------------------------------------
   DASHBOARD
--------------------------------------------------------- */
function renderDashboard() {
  const cards = [];
  if (can("orders", "view")) {
    const pending = state.orders.filter((o) => o.status === "pending").length;
    cards.push(statCard("Orders", state.orders.length, `${pending} pending`));
  }
  if (can("products", "view")) cards.push(statCard("Products", state.products.length, "in catalogue"));
  if (can("stock", "view")) {
    const low = state.stock.filter((s) => Number(s.qty) <= Number(s.reorderAt ?? 0)).length;
    cards.push(statCard("Low Stock", low, "items to reorder"));
  }
  if (can("users", "view")) cards.push(statCard("Team", state.users.length, "user accounts"));
  $("#statGrid").innerHTML = cards.join("") || `<p class="helper-text">Nothing to show yet.</p>`;

  const tbody = $("#dashRecentOrders tbody");
  if (!can("orders", "view")) {
    $("#dashRecentOrders").closest(".panel").hidden = true;
  } else {
    $("#dashRecentOrders").closest(".panel").hidden = false;
    const rows = [...state.orders]
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
      .slice(0, 6);
    tbody.innerHTML = rows.length ? rows.map((o) => `
      <tr>
        <td class="cell-strong">#${escapeHtml(o.id.slice(-6).toUpperCase())}</td>
        <td>${escapeHtml(o.customerName || "—")}</td>
        <td>${statusPill(o.status)}</td>
        <td>${fmtMoney(o.total)}</td>
      </tr>`).join("") : `<tr class="empty-row"><td colspan="4">No orders yet.</td></tr>`;
  }
}
function statCard(label, value, sub) {
  return `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${value}</strong><span>${escapeHtml(sub)}</span></div>`;
}
function statusPill(status) {
  const map = {
  "On Hold": "pill-warn",
  "Pending": "pill-gold",
  "Ready to Ship": "pill-slate",
  "Shipped": "pill-success",
  "Cancelled": "pill-rose",

  active: "pill-success",
  inactive: "pill-rose",
  "in stock": "pill-success",
  low: "pill-warn",
  out: "pill-rose",
};
  return `<span class="pill ${map[status] || "pill-slate"}">${escapeHtml(status || "—")}</span>`;
}

/* ===========================================================
   USERS (admin only)
=========================================================== */
function renderUsersTable() {
  const tbody = $("#usersTable tbody");
  if (!state.users.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No users yet — add your first teammate.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.users.map((u) => `
    <tr>
      <td class="cell-strong">${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><span class="pill pill-gold">${escapeHtml(roleLabel(u.role))}</span></td>
      <td>${statusPill(u.status)}</td>
      <td>${permChips(u.permissions)}</td>
      <td class="cell-actions">
        ${can("users", "edit") ? `<button class="btn btn-ghost btn-sm" data-edit-user="${u.uid}">Edit</button>` : ""}
        ${can("users", "delete") ? `<button class="btn btn-danger btn-sm" data-del-user="${u.uid}">Remove</button>` : ""}
      </td>
    </tr>`).join("");

  $$("[data-edit-user]", tbody).forEach((b) => b.addEventListener("click", () => openUserModal(b.dataset.editUser)));
  $$("[data-del-user]", tbody).forEach((b) => b.addEventListener("click", () => confirmDeleteUser(b.dataset.delUser)));
}
function permChips(permissions) {
  if (!permissions) return "—";
  const chips = MODULES.filter((m) => permissions[m]?.view).map((m) => `<span class="perm-chip">${m}</span>`);
  return chips.length ? `<div class="perm-chips">${chips.join("")}</div>` : "—";
}

$("#addUserBtn").addEventListener("click", () => openUserModal(null));

function openUserModal(uid) {
  const editing = !!uid;
  const u = editing ? state.users.find((x) => x.uid === uid) : null;
  const role = u?.role || "order_manager";
  const perms = u?.permissions || defaultPermissions(role);

  openModal(`
    <div class="modal-head">
      <h3>${editing ? "Edit User" : "New User"}</h3>
      <button class="modal-close" id="mClose">✕</button>
    </div>
    <form class="modal-form" id="userForm">
      <label class="field"><span>Full name</span>
        <input type="text" id="uName" required value="${escapeHtml(u?.name || "")}" placeholder="e.g. Priya Shah" />
      </label>
      <label class="field"><span>Email</span>
        <input type="email" id="uEmail" required ${editing ? "disabled" : ""} value="${escapeHtml(u?.email || "")}" placeholder="name@kiranfashion.com" />
      </label>
      ${editing ? `<p class="helper-text">Email can't be changed here. Use "Send password reset" if they're locked out.</p>` : `
      <label class="field"><span>Temporary password</span>
        <input type="password" id="uPassword" required minlength="6" placeholder="At least 6 characters" />
      </label>`}
      <label class="field"><span>Role</span>
        <select id="uRole">
          ${ROLES.map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${r.label}</option>`).join("")}
        </select>
      </label>
      ${editing ? `
      <label class="field"><span>Status</span>
        <select id="uStatus">
          <option value="active" ${u?.status !== "inactive" ? "selected" : ""}>Active</option>
          <option value="inactive" ${u?.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </label>` : ""}

      <div>
        <p class="helper-text" style="margin-bottom:8px;">Permissions — changing the role fills sensible defaults; tick or untick anything.</p>
        <div id="permBlock"></div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="uSave">${editing ? "Save Changes" : "Create User"}</button>
      </div>
    </form>
  `);

  const permBlock = $("#permBlock");
  function paintPerms(p) { permBlock.innerHTML = permissionGrid(p); }
  paintPerms(perms);

  $("#uRole").addEventListener("change", (e) => paintPerms(defaultPermissions(e.target.value)));
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);

  $("#userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = $("#uSave");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const name = $("#uName").value.trim();
      const roleVal = $("#uRole").value;
      const permissions = readPermissionGrid();

      if (editing) {
        const statusVal = $("#uStatus").value;
        await updateDoc(doc(db, COLLECTIONS.users, uid), { name, role: roleVal, permissions, status: statusVal });
        toast("User updated.", "success");
      } else {
        const email = $("#uEmail").value.trim();
        const password = $("#uPassword").value;
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await setDoc(doc(db, COLLECTIONS.users, cred.user.uid), {
          name, email, role: roleVal, permissions, status: "active", createdAt: serverTimestamp(),
        });
        await signOut(secondaryAuth); // clean up the secondary session
        toast("User created.", "success");
      }
      closeModal();
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = editing ? "Save Changes" : "Create User";
    }
  });
}

function permissionGrid(p) {
  return MODULES.map((m) => `
    <div class="perm-group">
      <div class="perm-group-title">${m}</div>
      <div class="checkbox-grid">
        ${ACTIONS.map((a) => `
          <label class="checkbox-row">
            <input type="checkbox" data-perm-mod="${m}" data-perm-action="${a}" ${p[m]?.[a] ? "checked" : ""} />
            ${a}
          </label>`).join("")}
      </div>
    </div>
  `).join("");
}
function readPermissionGrid() {
  const p = emptyPerms();
  $$("[data-perm-mod]").forEach((box) => {
    p[box.dataset.permMod][box.dataset.permAction] = box.checked;
  });
  return p;
}

function confirmDeleteUser(uid) {
  const u = state.users.find((x) => x.uid === uid);
  if (!u) return;
  if (uid === state.profile.uid) { toast("You can't remove your own account.", "error"); return; }
  openModal(`
    <div class="modal-head"><h3>Remove ${escapeHtml(u.name || u.email)}?</h3>
      <button class="modal-close" id="mClose">✕</button></div>
    <p class="helper-text" style="font-size:13px;line-height:1.6;">
      This removes their profile and revokes access immediately by deactivating the account.
      Their sign-in record stays in Firebase Authentication — delete it there too, or wire up
      the optional Cloud Function in <code>functions/</code> to remove it automatically.
    </p>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
      <button type="button" class="btn btn-danger" id="mConfirm">Remove User</button>
    </div>
  `);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);
  $("#mConfirm").addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, COLLECTIONS.users, uid), {
  status: "inactive"
});
      await deleteDoc(doc(db, COLLECTIONS.users, uid));
      toast("User removed.", "success");
      closeModal();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

/* ===========================================================
   PRODUCTS
=========================================================== */
function renderProductsTable() {
  $("#addProductBtn").hidden = !can("products", "create");
  const tbody = $("#productsTable tbody");
  if (!state.products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No products yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.products.map((p) => {
    const stockEntry = state.stock.find((s) => s.productId === p.id);
    return `
    <tr>
      <td class="cell-strong">${escapeHtml(p.name)}</td>
      <td class="cell-mono">${escapeHtml(p.sku || "—")}</td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td>${fmtMoney(p.price)}</td>
      <td>${stockEntry ? stockEntry.qty : "—"}</td>
      <td class="cell-actions">
        ${can("products", "edit") ? `<button class="btn btn-ghost btn-sm" data-edit-product="${p.id}">Edit</button>` : ""}
        ${can("products", "delete") ? `<button class="btn btn-danger btn-sm" data-del-product="${p.id}">Delete</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  $$("[data-edit-product]", tbody).forEach((b) => b.addEventListener("click", () => openProductModal(b.dataset.editProduct)));
  $$("[data-del-product]", tbody).forEach((b) => b.addEventListener("click", () => deleteProduct(b.dataset.delProduct)));
}

$("#addProductBtn").addEventListener("click", () => openProductModal(null));

function openProductModal(id) {
  const editing = !!id;
  const p = editing ? state.products.find((x) => x.id === id) : null;

  openModal(`
    <div class="modal-head"><h3>${editing ? "Edit Product" : "New Product"}</h3>
      <button class="modal-close" id="mClose">✕</button></div>
    <form class="modal-form" id="productForm">
      <label class="field"><span>Product name</span>
        <input type="text" id="pName" required value="${escapeHtml(p?.name || "")}" placeholder="e.g. Banarasi Silk Saree" /></label>
      <div class="form-row">
        <label class="field"><span>SKU</span>
          <input type="text" id="pSku" required value="${escapeHtml(p?.sku || "")}" placeholder="KF-SAR-001" /></label>
        <label class="field"><span>Category</span>
          <input type="text" id="pCategory" value="${escapeHtml(p?.category || "")}" placeholder="Sarees" /></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Price (₹)</span>
          <input type="number" min="0" step="1" id="pPrice" required value="${p?.price ?? ""}" /></label>
        <label class="field"><span>Starting stock</span>
          <input type="number" min="0" step="1" id="pStock" ${editing ? "disabled" : ""} value="${editing ? (state.stock.find(s=>s.productId===id)?.qty ?? 0) : 0}" /></label>
      </div>
      <label class="field"><span>Description</span>
        <textarea id="pDesc" rows="3" placeholder="Fabric, fit, care notes…">${escapeHtml(p?.description || "")}</textarea></label>
      ${editing ? "" : `<p class="helper-text">A matching stock entry is created automatically.</p>`}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="pSave">${editing ? "Save Changes" : "Add Product"}</button>
      </div>
    </form>
  `);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);

  openModal(`
<form class="modal-form" id="orderForm">
...
</form>
`);

$("#mClose").addEventListener("click", closeModal);
$("#mCancel").addEventListener("click", closeModal);

$("#orderForm").addEventListener("submit", async (e) => {
   ...
});
    e.preventDefault();
    const btn = $("#pSave");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const payload = {
        name: $("#pName").value.trim(),
        sku: $("#pSku").value.trim(),
        category: $("#pCategory").value.trim(),
        price: Number($("#pPrice").value || 0),
        description: $("#pDesc").value.trim(),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, COLLECTIONS.products, id), payload);
        toast("Product updated.", "success");
      } else {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, COLLECTIONS.products), payload);
        await setDoc(doc(db, COLLECTIONS.stock, ref.id), {
          productId: ref.id, productName: payload.name, sku: payload.sku,
          qty: Number($("#pStock").value || 0), reorderAt: 5, updatedAt: serverTimestamp(),
        });
        toast("Product added.", "success");
      }
      closeModal();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = editing ? "Save Changes" : "Add Product";
    }
  });
}

async function deleteProduct(id) {
  if (!confirm("Delete this product? This can't be undone.")) return;
  try {
    await deleteDoc(doc(db, COLLECTIONS.products, id));
    toast("Product deleted.", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* ===========================================================
   ORDERS
=========================================================== */
const ORDER_STATUSES = [
  "On Hold",
  "Pending",
  "Ready to Ship",
  "Shipped",
  "Cancelled"
];
function renderOrdersTable() {
  $("#addOrderBtn").hidden = !can("orders", "create");
  const tbody = $("#ordersTable tbody");
  if (!state.orders.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No orders yet.</td></tr>`;
    return;
  }
  const rows = [...state.orders].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

tbody.innerHTML = rows.map((o) => `
<tr>
  <td class="cell-strong">${escapeHtml(o.customerName || "—")}</td>
  <td>${escapeHtml(o.product || "—")}</td>
  <td>${escapeHtml(o.size || "—")}</td>
  <td>${escapeHtml(o.payment || "—")}</td>
  <td>${statusPill(o.status)}</td>
  <td class="cell-actions">
    ${can("orders", "delete") ? `<button class="btn btn-danger btn-sm" data-del-order="${o.id}">Delete</button>` : ""}
  </td>
</tr>
`).join("");
  tbody.innerHTML = rows.map((o) => `
    <tr>
      <td class="cell-strong">#${escapeHtml(o.id.slice(-6).toUpperCase())}</td>
      <td>${escapeHtml(o.customerName || "—")}</td>
      <td>${escapeHtml(o.items || "—")}</td>
      <td>${fmtMoney(o.total)}</td>
      <td>
        ${can("orders", "edit")
          ? `<select class="pill" style="border:none;" data-status-order="${o.id}">
              ${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>`
          : statusPill(o.status)}
      </td>
      <td class="cell-actions">
        ${can("orders", "delete") ? `<button class="btn btn-danger btn-sm" data-del-order="${o.id}">Delete</button>` : ""}
      </td>
    </tr>`).join("");

  $$("[data-status-order]", tbody).forEach((sel) => sel.addEventListener("change", async () => {
    try {
      await updateDoc(doc(db, COLLECTIONS.orders, sel.dataset.statusOrder), { status: sel.value });
      toast("Order status updated.", "success");
    } catch (err) { toast(err.message, "error"); }
  }));
  $$("[data-del-order]", tbody).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Delete this order?")) return;
    try { await deleteDoc(doc(db, COLLECTIONS.orders, b.dataset.delOrder)); toast("Order deleted.", "success"); }
    catch (err) { toast(err.message, "error"); }
  }));
}

$("#addOrderBtn").addEventListener("click", () => openOrderModal());

function openOrderModal() {
  openModal(`
    <form class="modal-form" id="orderForm">

<label class="field">
<span>Company</span>
<select id="oCompany">
<option value="Meesho">Meesho</option>
</select>
</label>

<label class="field">
<span>Customer Name</span>
<input type="text" id="oCustomer" required>
</label>

<label class="field">
<span>Address</span>
<textarea id="oAddress" rows="3" required></textarea>
</label>

<label class="field">
<span>Mobile Number (Optional)</span>
<input type="text" id="oMobile">
</label>

<label class="field">
<span>Product Name</span>
<input type="text" id="oProduct" required>
</label>

<label class="field">
<span>Size</span>
<select id="oSize" required>
<option>XS</option>
<option>S</option>
<option>M</option>
<option>L</option>
<option>XL</option>
<option>XXL</option>
<option>XXXL</option>
<option>4XL</option>
<option>5XL</option>
</select>
</label>

<label class="field">
<span>Payment Mode</span>
<select id="oPayment">
<option>COD</option>
<option>Online</option>
</select>
</label>

<label class="field">
<span>Order Status</span>
<select id="oStatus">
<option>On Hold</option>
<option>Pending</option>
<option>Ready to Ship</option>
<option>Shipped</option>
<option>Cancelled</option>
</select>
</label>

<label class="field">
<span>Courier Partner (Optional)</span>
<select id="oCourier">
<option value="">Select</option>
<option>Valmo</option>
<option>Xpressbees</option>
<option>Shadowfax</option>
<option>Delhivery</option>
<option>Ecom</option>
</select>
</label>

<label class="field">
<span>Dispatch Date</span>
<input type="date" id="oDispatch">
</label>

<label class="field">
<span>Special Note (Optional)</span>
<textarea id="oNote" rows="3"></textarea>
</label>

<div class="modal-actions">
<button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
<button type="submit" class="btn btn-primary" id="oSave">Review Order</button>
</div>

</form>
`);

$("#mClose").addEventListener("click", closeModal);
$("#mCancel").addEventListener("click", closeModal);

$("#orderForm").addEventListener("submit", async (e) => {
  $("#orderForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#oSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
  await addDoc(collection(db, COLLECTIONS.orders), {
  company: $("#oCompany").value,
  customerName: $("#oCustomer").value.trim(),
  address: $("#oAddress").value.trim(),
  mobile: $("#oMobile").value.trim(),
  product: $("#oProduct").value.trim(),
  size: $("#oSize").value,
  payment: $("#oPayment").value,
  status: $("#oStatus").value,
  courier: $("#oCourier").value,
  dispatchDate: $("#oDispatch").value,
  note: $("#oNote").value.trim(),

  createdBy: state.profile.name,
  createdByEmail: state.profile.email,

  createdAt: serverTimestamp(),
  createdAtMs: Date.now(),
});
      toast("Order created.", "success");
      closeModal();
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "Review Order"; }
  });
}

/* ===========================================================
   STOCK
=========================================================== */
function renderStockTable() {
  const tbody = $("#stockTable tbody");
  if (!state.stock.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No stock entries yet — add a product to create one.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.stock.map((s) => {
    const status = Number(s.qty) <= 0 ? "out" : Number(s.qty) <= Number(s.reorderAt ?? 0) ? "low" : "in stock";
    return `
    <tr>
      <td class="cell-strong">${escapeHtml(s.productName || "—")}</td>
      <td class="cell-mono">${escapeHtml(s.sku || "—")}</td>
      <td>${can("stock", "edit")
        ? `<input type="number" min="0" style="width:80px" data-qty-stock="${s.id}" value="${s.qty ?? 0}" />`
        : (s.qty ?? 0)}</td>
      <td>${can("stock", "edit")
        ? `<input type="number" min="0" style="width:80px" data-reorder-stock="${s.id}" value="${s.reorderAt ?? 0}" />`
        : (s.reorderAt ?? 0)}</td>
      <td>${statusPill(status)}</td>
      <td class="cell-actions">
        ${can("stock", "edit") ? `<button class="btn btn-ghost btn-sm" data-save-stock="${s.id}">Save</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  $$("[data-save-stock]", tbody).forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.saveStock;
    const qty = Number($(`[data-qty-stock="${id}"]`).value || 0);
    const reorderAt = Number($(`[data-reorder-stock="${id}"]`).value || 0);
    try {
      await updateDoc(doc(db, COLLECTIONS.stock, id), { qty, reorderAt, updatedAt: serverTimestamp() });
      toast("Stock updated.", "success");
    } catch (err) { toast(err.message, "error"); }
  }));
}

/* ---------------------------------------------------------
   Escape hatch: keep hash in sync (optional deep-linking)
--------------------------------------------------------- */
window.addEventListener("hashchange", () => {
  const id = location.hash.replace("#", "");
  if (id && NAV_ITEMS.some((n) => n.id === id)) navigateTo(id);
});
