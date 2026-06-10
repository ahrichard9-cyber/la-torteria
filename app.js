const paymentMethods = ["Efectivo", "Yape", "Plin", "Tarjeta", "Transferencia"];
const saleCategories = ["Tortas", "Postres", "Helados", "Marcianos", "Panetones"];
const expenseCategories = ["Insumos", "Personal", "Servicios", "Transporte", "Marketing", "Otros"];
const inventoryOptions = ["Harina", "Azúcar", "Huevos", "Leche", "Chocolate", "Envases", "Otros"];
const titles = {
  dashboard: "Panel principal",
  productos: "Base de datos de productos",
  ventas: "Registro de ventas",
  gastos: "Registro de gastos",
  cierre: "Cierre diario",
  reportes: "Reportes",
  inventario: "Inventario básico"
};

let state = { sales: [], expenses: [], inventory: [], products: [], closures: [] };
let users = [];
let currentUser = null;
let appEventsBound = false;

function normalizeState(data) {
  return {
    sales: Array.isArray(data.sales) ? data.sales : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    inventory: Array.isArray(data.inventory) ? data.inventory : [],
    products: Array.isArray(data.products) ? data.products : [],
    closures: Array.isArray(data.closures) ? data.closures : []
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error de comunicación.");
  return data;
}

async function refreshState() {
  const data = await apiRequest("/api/data");
  state = normalizeState(data);
  currentUser = data.user || currentUser;
  if (currentUser?.role === "admin") await loadUsers();
  renderAll();
}

async function loadUsers() {
  const data = await apiRequest("/api/users");
  users = data.users || [];
  renderUsers();
}

async function persistResource(resource, item) {
  const data = await apiRequest(`/api/data?resource=${resource}`, {
    method: "POST",
    body: JSON.stringify(item)
  });
  await refreshState();
  return data.item;
}

async function deleteResource(resource, id) {
  await apiRequest(`/api/data?resource=${resource}`, {
    method: "DELETE",
    body: JSON.stringify({ id })
  });
  await refreshState();
}

function money(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function byDateDesc(a, b) {
  return `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`);
}

function sum(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

function inSameWeek(dateText, referenceText) {
  const date = new Date(`${dateText}T00:00:00`);
  const reference = new Date(`${referenceText}T00:00:00`);
  const day = (reference.getDay() + 6) % 7;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return date >= monday && date <= sunday;
}

function inSameMonth(dateText, referenceText) {
  return dateText.slice(0, 7) === referenceText.slice(0, 7);
}

function groupSum(items, keySelector, valueSelector) {
  return items.reduce((acc, item) => {
    const key = keySelector(item) || "Sin dato";
    acc[key] = (acc[key] || 0) + Number(valueSelector(item) || 0);
    return acc;
  }, {});
}

function topKey(grouped) {
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "-";
}

function fillOptions(select, values) {
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function fillCategoryFilter(select) {
  select.innerHTML = `<option value="">Todas</option>${getKnownCategories().map((value) => `<option value="${value}">${value}</option>`).join("")}`;
}

function getKnownCategories() {
  return [...new Set([...saleCategories, ...state.products.map((product) => product.category).filter(Boolean)])];
}

function ensureSelectOption(select, value) {
  if (!value) return;
  if (![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
}

function fillDatalist(list, values) {
  list.innerHTML = values.map((value) => `<option value="${value}"></option>`).join("");
}

function getActiveDate() {
  return document.querySelector("#activeDate").value || today();
}

function setDefaults() {
  document.querySelector("#activeDate").value = today();
  document.querySelector("#saleDate").value = today();
  document.querySelector("#saleTime").value = currentTime();
  document.querySelector("#expenseDate").value = today();
  document.querySelector("#reportStart").value = today().slice(0, 8) + "01";
  document.querySelector("#reportEnd").value = today();
}

async function initialize() {
  document.body.classList.add("locked");
  bindAuthEvents();
  fillOptions(document.querySelector("#saleCategory"), saleCategories);
  fillOptions(document.querySelector("#productCategory"), saleCategories);
  fillCategoryFilter(document.querySelector("#productCategoryFilter"));
  fillOptions(document.querySelector("#salePayment"), paymentMethods);
  fillOptions(document.querySelector("#expenseCategory"), expenseCategories);
  fillDatalist(document.querySelector("#inventoryOptions"), inventoryOptions);
  setDefaults();
  await checkAuthStatus();
}

function bindAuthEvents() {
  document.querySelector("#setupForm").addEventListener("submit", submitSetup);
  document.querySelector("#loginForm").addEventListener("submit", submitLogin);
}

async function checkAuthStatus() {
  try {
    const status = await apiRequest("/api/status");
    if (status.setupRequired) {
      showSetupScreen();
      return;
    }
    if (!status.user) {
      showLoginScreen();
      return;
    }
    await startApp(status.user);
  } catch (error) {
    showLoginScreen(error.message);
  }
}

function showSetupScreen(message = "") {
  document.body.classList.add("locked");
  document.querySelector("#setupScreen").classList.remove("hidden");
  document.querySelector("#loginScreen").classList.add("hidden");
  document.querySelector("#setupMessage").textContent = message;
}

function showLoginScreen(message = "") {
  document.body.classList.add("locked");
  document.querySelector("#setupScreen").classList.add("hidden");
  document.querySelector("#loginScreen").classList.remove("hidden");
  document.querySelector("#loginMessage").textContent = message;
}

async function startApp(user) {
  currentUser = user;
  document.body.classList.remove("locked", "role-admin", "role-employee");
  document.body.classList.add(`role-${user.role === "admin" ? "admin" : "employee"}`);
  document.querySelector("#setupScreen").classList.add("hidden");
  document.querySelector("#loginScreen").classList.add("hidden");
  document.querySelector("#currentUserLabel").textContent = `${user.username} · ${roleLabel(user.role)}`;
  if (!appEventsBound) {
    bindEvents();
    appEventsBound = true;
  }
  if (user.role === "admin") resetUserForm();
  if (user.role !== "admin" && ["productos", "reportes", "inventario", "usuarios"].includes(document.querySelector(".view.active")?.id)) {
    showView("dashboard");
  }
  await refreshState();
}

async function submitSetup(event) {
  event.preventDefault();
  const username = document.querySelector("#setupUsername").value.trim();
  const password = document.querySelector("#setupPassword").value;
  const confirmPassword = document.querySelector("#setupConfirmPassword").value;
  if (password !== confirmPassword) {
    showSetupScreen("Las contraseñas no coinciden.");
    return;
  }
  try {
    const data = await apiRequest("/api/setup", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    showLoginScreen("Administrador creado. Inicia sesión para continuar.");
    document.querySelector("#loginUsername").value = data.user.username;
  } catch (error) {
    showSetupScreen(error.message);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  try {
    const data = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#loginUsername").value.trim(),
        password: document.querySelector("#loginPassword").value
      })
    });
    await startApp(data.user);
  } catch (error) {
    showLoginScreen(error.message);
  }
}

function roleLabel(role) {
  return role === "admin" ? "Administrador" : "Empleado";
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelector("#activeDate").addEventListener("change", renderAll);
  document.querySelector("#saleQuantity").addEventListener("input", updateSaleTotal);
  document.querySelector("#salePrice").addEventListener("input", updateSaleTotal);
  document.querySelector("#saleProductSearch").addEventListener("input", renderSaleProductResults);
  document.querySelector("#saleProductSearch").addEventListener("focus", renderSaleProductResults);
  document.querySelector("#saleForm").addEventListener("submit", saveSale);
  document.querySelector("#productForm").addEventListener("submit", saveProduct);
  document.querySelector("#productImportFile").addEventListener("change", importProductsFromExcel);
  document.querySelector("#productSearch").addEventListener("input", renderProducts);
  document.querySelector("#productCategoryFilter").addEventListener("change", renderProducts);
  document.querySelector("#userForm").addEventListener("submit", saveUser);
  document.querySelector("#cancelUserEdit").addEventListener("click", resetUserForm);
  document.querySelector("#expenseForm").addEventListener("submit", saveExpense);
  document.querySelector("#inventoryForm").addEventListener("submit", saveInventory);
  document.querySelector("#cancelSaleEdit").addEventListener("click", resetSaleForm);
  document.querySelector("#cancelProductEdit").addEventListener("click", resetProductForm);
  document.querySelector("#cancelExpenseEdit").addEventListener("click", resetExpenseForm);
  document.querySelector("#cancelInventoryEdit").addEventListener("click", resetInventoryForm);
  document.querySelector("#printCloseBtn").addEventListener("click", () => printView("print-close"));
  document.querySelector("#saveCloseBtn").addEventListener("click", saveClosure);
  document.querySelector("#exportCloseBtn").addEventListener("click", exportClosure);
  document.querySelector("#exportReportCsv").addEventListener("click", exportReportCsv);
  document.querySelector("#exportReportPdf").addEventListener("click", () => printView("print-report"));
  document.querySelector("#backupBtn").addEventListener("click", exportBackup);
  document.querySelector("#logoutBtn").addEventListener("click", logout);
  document.querySelector("#seedBtn").addEventListener("click", seedExampleData);
  document.querySelector("#reportStart").addEventListener("change", renderReports);
  document.querySelector("#reportEnd").addEventListener("change", renderReports);

  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => exportTable(button.dataset.export));
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-close", "print-report");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-field")) {
      document.querySelector("#saleProductResults").classList.add("hidden");
    }
  });
}

function showView(viewName) {
  if (currentUser?.role !== "admin" && ["productos", "reportes", "inventario", "usuarios"].includes(viewName)) {
    viewName = "dashboard";
  }
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewName));
  document.querySelector("#pageTitle").textContent = titles[viewName];
}

async function logout() {
  await apiRequest("/api/logout", { method: "POST" });
  currentUser = null;
  state = { sales: [], expenses: [], inventory: [], products: [], closures: [] };
  users = [];
  document.querySelector("#loginForm").reset();
  showLoginScreen();
}

function updateSaleTotal() {
  const quantity = Number(document.querySelector("#saleQuantity").value || 0);
  const price = Number(document.querySelector("#salePrice").value || 0);
  document.querySelector("#saleTotal").value = (quantity * price).toFixed(2);
}

function renderSaleProductResults() {
  const input = document.querySelector("#saleProductSearch");
  const results = document.querySelector("#saleProductResults");
  const selectedId = document.querySelector("#saleProductId").value;
  const selectedProduct = state.products.find((product) => product.id === selectedId);
  if (selectedProduct && input.value !== `${selectedProduct.code} - ${selectedProduct.name}`) {
    document.querySelector("#saleProductId").value = "";
    document.querySelector("#saleProductCode").value = "";
    document.querySelector("#saleProduct").value = "";
  }
  const query = normalizeText(input.value);
  const activeProducts = state.products.filter((product) => (product.status || "Activo") === "Activo");
  const matches = activeProducts
    .filter((product) => {
      const haystack = normalizeText(`${product.code} ${product.name} ${product.category}`);
      return !query || haystack.includes(query);
    })
    .slice(0, 8);

  if (!matches.length) {
    results.innerHTML = `<div class="search-empty">No hay productos activos que coincidan.</div>`;
    results.classList.remove("hidden");
    return;
  }

  results.innerHTML = matches.map((product) => `
    <button type="button" class="search-option" onclick="selectSaleProduct('${product.id}')">
      <strong>${escapeHtml(product.name)}</strong>
      <span>${escapeHtml(product.code)} · ${escapeHtml(product.category)} · ${money(product.price)}</span>
    </button>
  `).join("");
  results.classList.remove("hidden");
}

function selectSaleProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  document.querySelector("#saleProductId").value = product.id;
  document.querySelector("#saleProductCode").value = product.code;
  document.querySelector("#saleProductSearch").value = `${product.code} - ${product.name}`;
  document.querySelector("#saleProduct").value = product.name;
  ensureSelectOption(document.querySelector("#saleCategory"), product.category);
  document.querySelector("#saleCategory").value = product.category;
  document.querySelector("#salePrice").value = Number(product.price || 0).toFixed(2);
  document.querySelector("#saleProductResults").classList.add("hidden");
  updateSaleTotal();
}

async function saveSale(event) {
  event.preventDefault();
  updateSaleTotal();
  const id = document.querySelector("#saleId").value || uid("sale");
  const sale = {
    id,
    date: document.querySelector("#saleDate").value,
    time: document.querySelector("#saleTime").value,
    productId: document.querySelector("#saleProductId").value,
    productCode: document.querySelector("#saleProductCode").value,
    product: document.querySelector("#saleProduct").value.trim(),
    category: document.querySelector("#saleCategory").value,
    quantity: Number(document.querySelector("#saleQuantity").value),
    price: Number(document.querySelector("#salePrice").value),
    total: Number(document.querySelector("#saleTotal").value),
    payment: document.querySelector("#salePayment").value
  };
  await persistResource("sales", sale);
  resetSaleForm();
}

async function saveProduct(event) {
  event.preventDefault();
  const id = document.querySelector("#productId").value || uid("product");
  const code = document.querySelector("#productCode").value.trim();
  const product = {
    id,
    code,
    name: document.querySelector("#productName").value.trim(),
    category: document.querySelector("#productCategory").value,
    price: Number(document.querySelector("#productPrice").value),
    cost: Number(document.querySelector("#productCost").value || 0),
    status: document.querySelector("#productStatus").value
  };
  await persistResource("products", product);
  resetProductForm();
  showProductImportStatus("Producto guardado correctamente.");
}

async function saveExpense(event) {
  event.preventDefault();
  const id = document.querySelector("#expenseId").value || uid("expense");
  const expense = {
    id,
    date: document.querySelector("#expenseDate").value,
    description: document.querySelector("#expenseDescription").value.trim(),
    category: document.querySelector("#expenseCategory").value,
    amount: Number(document.querySelector("#expenseAmount").value)
  };
  await persistResource("expenses", expense);
  resetExpenseForm();
}

async function saveInventory(event) {
  event.preventDefault();
  const id = document.querySelector("#inventoryId").value || uid("stock");
  const stockItem = {
    id,
    name: document.querySelector("#inventoryName").value.trim(),
    stock: Number(document.querySelector("#inventoryStock").value),
    minimum: Number(document.querySelector("#inventoryMin").value),
    unit: document.querySelector("#inventoryUnit").value.trim(),
    cost: Number(document.querySelector("#inventoryCost").value)
  };
  await persistResource("inventory", stockItem);
  resetInventoryForm();
}

function resetSaleForm() {
  document.querySelector("#saleForm").reset();
  document.querySelector("#saleId").value = "";
  document.querySelector("#saleProductId").value = "";
  document.querySelector("#saleProductCode").value = "";
  document.querySelector("#saleDate").value = getActiveDate();
  document.querySelector("#saleTime").value = currentTime();
  document.querySelector("#saleQuantity").value = 1;
  document.querySelector("#salePrice").value = 0;
  document.querySelector("#saleProductResults").classList.add("hidden");
  updateSaleTotal();
  document.querySelector("#cancelSaleEdit").classList.add("hidden");
}

function resetProductForm() {
  document.querySelector("#productForm").reset();
  document.querySelector("#productId").value = "";
  document.querySelector("#cancelProductEdit").classList.add("hidden");
}

function resetUserForm() {
  document.querySelector("#userForm").reset();
  document.querySelector("#userId").value = "";
  document.querySelector("#userPassword").required = true;
  document.querySelector("#cancelUserEdit").classList.add("hidden");
}

function resetExpenseForm() {
  document.querySelector("#expenseForm").reset();
  document.querySelector("#expenseId").value = "";
  document.querySelector("#expenseDate").value = getActiveDate();
  document.querySelector("#cancelExpenseEdit").classList.add("hidden");
}

function resetInventoryForm() {
  document.querySelector("#inventoryForm").reset();
  document.querySelector("#inventoryId").value = "";
  document.querySelector("#cancelInventoryEdit").classList.add("hidden");
}

function editSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  showView("ventas");
  document.querySelector("#saleId").value = sale.id;
  document.querySelector("#saleProductId").value = sale.productId || "";
  document.querySelector("#saleProductCode").value = sale.productCode || "";
  document.querySelector("#saleDate").value = sale.date;
  document.querySelector("#saleTime").value = sale.time;
  document.querySelector("#saleProductSearch").value = sale.productCode ? `${sale.productCode} - ${sale.product}` : sale.product;
  document.querySelector("#saleProduct").value = sale.product;
  ensureSelectOption(document.querySelector("#saleCategory"), sale.category);
  document.querySelector("#saleCategory").value = sale.category;
  document.querySelector("#saleQuantity").value = sale.quantity;
  document.querySelector("#salePrice").value = sale.price;
  document.querySelector("#saleTotal").value = sale.total.toFixed(2);
  document.querySelector("#salePayment").value = sale.payment;
  document.querySelector("#cancelSaleEdit").classList.remove("hidden");
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  showView("productos");
  document.querySelector("#productId").value = product.id;
  document.querySelector("#productCode").value = product.code;
  document.querySelector("#productName").value = product.name;
  ensureSelectOption(document.querySelector("#productCategory"), product.category);
  document.querySelector("#productCategory").value = product.category;
  document.querySelector("#productPrice").value = product.price;
  document.querySelector("#productCost").value = product.cost || "";
  document.querySelector("#productStatus").value = product.status || "Activo";
  document.querySelector("#cancelProductEdit").classList.remove("hidden");
}

function editUser(id) {
  const user = users.find((item) => item.id === id);
  if (!user) return;
  showView("usuarios");
  document.querySelector("#userId").value = user.id;
  document.querySelector("#userUsername").value = user.username;
  document.querySelector("#userPassword").value = "";
  document.querySelector("#userPassword").required = false;
  document.querySelector("#userRole").value = user.role;
  document.querySelector("#userActive").value = String(Boolean(user.active));
  document.querySelector("#cancelUserEdit").classList.remove("hidden");
}

async function saveUser(event) {
  event.preventDefault();
  const id = document.querySelector("#userId").value;
  const body = {
    id,
    username: document.querySelector("#userUsername").value.trim(),
    password: document.querySelector("#userPassword").value,
    role: document.querySelector("#userRole").value,
    active: document.querySelector("#userActive").value === "true"
  };
  if (!id && !body.password) {
    alert("La contraseña es obligatoria para usuarios nuevos.");
    return;
  }
  await apiRequest("/api/users", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body)
  });
  resetUserForm();
  await loadUsers();
}

function editExpense(id) {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;
  showView("gastos");
  document.querySelector("#expenseId").value = expense.id;
  document.querySelector("#expenseDate").value = expense.date;
  document.querySelector("#expenseDescription").value = expense.description;
  document.querySelector("#expenseCategory").value = expense.category;
  document.querySelector("#expenseAmount").value = expense.amount;
  document.querySelector("#cancelExpenseEdit").classList.remove("hidden");
}

function editInventory(id) {
  const item = state.inventory.find((entry) => entry.id === id);
  if (!item) return;
  showView("inventario");
  document.querySelector("#inventoryId").value = item.id;
  document.querySelector("#inventoryName").value = item.name;
  document.querySelector("#inventoryStock").value = item.stock;
  document.querySelector("#inventoryMin").value = item.minimum;
  document.querySelector("#inventoryUnit").value = item.unit;
  document.querySelector("#inventoryCost").value = item.cost;
  document.querySelector("#cancelInventoryEdit").classList.remove("hidden");
}

async function removeSale(id) {
  if (!confirm("¿Eliminar esta venta?")) return;
  await deleteResource("sales", id);
}

async function removeProduct(id) {
  if (!confirm("¿Eliminar este producto?")) return;
  await deleteResource("products", id);
}

async function removeExpense(id) {
  if (!confirm("¿Eliminar este gasto?")) return;
  await deleteResource("expenses", id);
}

async function removeInventory(id) {
  if (!confirm("¿Eliminar este insumo?")) return;
  await deleteResource("inventory", id);
}

function renderAll() {
  renderCategoryControls();
  renderProducts();
  renderSales();
  renderExpenses();
  renderInventory();
  renderDashboard();
  renderClosure();
  renderReports();
}

function renderCategoryControls() {
  const productCategory = document.querySelector("#productCategory");
  const productCategoryValue = productCategory.value;
  fillOptions(productCategory, getKnownCategories());
  productCategory.value = productCategoryValue || productCategory.options[0]?.value || "";

  const filter = document.querySelector("#productCategoryFilter");
  const filterValue = filter.value;
  fillCategoryFilter(filter);
  filter.value = filterValue;
}

function renderProducts() {
  const search = normalizeText(document.querySelector("#productSearch")?.value || "");
  const category = document.querySelector("#productCategoryFilter")?.value || "";
  const products = state.products
    .filter((product) => !category || product.category === category)
    .filter((product) => {
      const haystack = normalizeText(`${product.code} ${product.name} ${product.category}`);
      return !search || haystack.includes(search);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = products.map((product) => `
    <tr>
      <td>${escapeHtml(product.code)}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td><strong>${money(product.price)}</strong></td>
      <td>${product.cost ? money(product.cost) : "-"}</td>
      <td><span class="badge ${product.status === "Activo" ? "ok" : "low"}">${escapeHtml(product.status || "Activo")}</span></td>
      <td class="actions">
        <button class="secondary-button" type="button" onclick="editProduct('${product.id}')">Editar</button>
        <button class="danger-button" type="button" onclick="removeProduct('${product.id}')">Eliminar</button>
      </td>
    </tr>
  `).join("");
  document.querySelector("#productsTable").innerHTML = rows || emptyRow(7, "Aún no hay productos registrados.");
}

function renderUsers() {
  const table = document.querySelector("#usersTable");
  if (!table) return;
  const rows = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${roleLabel(user.role)}</td>
      <td><span class="badge ${user.active ? "ok" : "low"}">${user.active ? "Activo" : "Inactivo"}</span></td>
      <td class="actions">
        <button class="secondary-button" type="button" onclick="editUser('${user.id}')">Editar</button>
      </td>
    </tr>
  `).join("");
  table.innerHTML = rows || emptyRow(4, "Aún no hay usuarios registrados.");
}

function renderSales() {
  const rows = [...state.sales].sort(byDateDesc).map((sale) => `
    <tr>
      <td>${sale.date}</td>
      <td>${sale.time}</td>
      <td>${escapeHtml(sale.product)}</td>
      <td>${sale.category}</td>
      <td>${sale.quantity}</td>
      <td>${money(sale.price)}</td>
      <td><strong>${money(sale.total)}</strong></td>
      <td>${sale.payment}</td>
      <td class="actions">
        <button class="secondary-button" type="button" onclick="editSale('${sale.id}')">Editar</button>
        <button class="danger-button" type="button" onclick="removeSale('${sale.id}')">Eliminar</button>
      </td>
    </tr>
  `).join("");
  document.querySelector("#salesTable").innerHTML = rows || emptyRow(9, "Aún no hay ventas registradas.");
}

function renderExpenses() {
  const rows = [...state.expenses].sort(byDateDesc).map((expense) => `
    <tr>
      <td>${expense.date}</td>
      <td>${escapeHtml(expense.description)}</td>
      <td>${expense.category}</td>
      <td><strong>${money(expense.amount)}</strong></td>
      <td class="actions">
        <button class="secondary-button" type="button" onclick="editExpense('${expense.id}')">Editar</button>
        <button class="danger-button" type="button" onclick="removeExpense('${expense.id}')">Eliminar</button>
      </td>
    </tr>
  `).join("");
  document.querySelector("#expensesTable").innerHTML = rows || emptyRow(5, "Aún no hay gastos registrados.");
}

function renderInventory() {
  const alerts = state.inventory.filter((item) => item.stock <= item.minimum);
  document.querySelector("#stockAlerts").innerHTML = alerts.map((item) =>
    `<div class="alert">Stock bajo: ${escapeHtml(item.name)} tiene ${item.stock} ${escapeHtml(item.unit)}.</div>`
  ).join("");

  const rows = state.inventory.map((item) => {
    const low = item.stock <= item.minimum;
    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.stock}</td>
        <td>${item.minimum}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td>${money(item.cost)}</td>
        <td><span class="badge ${low ? "low" : "ok"}">${low ? "Bajo" : "Correcto"}</span></td>
        <td class="actions">
          <button class="secondary-button" type="button" onclick="editInventory('${item.id}')">Editar</button>
          <button class="danger-button" type="button" onclick="removeInventory('${item.id}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join("");
  document.querySelector("#inventoryTable").innerHTML = rows || emptyRow(7, "Aún no hay insumos registrados.");
}

function renderDashboard() {
  const activeDate = getActiveDate();
  const daySales = state.sales.filter((sale) => sale.date === activeDate);
  const weekSales = state.sales.filter((sale) => inSameWeek(sale.date, activeDate));
  const monthSales = state.sales.filter((sale) => inSameMonth(sale.date, activeDate));
  const dayExpenses = state.expenses.filter((expense) => expense.date === activeDate);
  const monthExpenses = state.expenses.filter((expense) => inSameMonth(expense.date, activeDate));

  document.querySelector("#dashSalesDay").textContent = money(sum(daySales, (sale) => sale.total));
  document.querySelector("#dashSalesWeek").textContent = money(sum(weekSales, (sale) => sale.total));
  document.querySelector("#dashSalesMonth").textContent = money(sum(monthSales, (sale) => sale.total));
  document.querySelector("#dashExpensesDay").textContent = money(sum(dayExpenses, (expense) => expense.amount));
  document.querySelector("#dashExpensesMonth").textContent = money(sum(monthExpenses, (expense) => expense.amount));
  document.querySelector("#dashProfit").textContent = money(sum(monthSales, (sale) => sale.total) - sum(monthExpenses, (expense) => expense.amount));
  document.querySelector("#dashTopProduct").textContent = topKey(groupSum(monthSales, (sale) => sale.product, (sale) => sale.quantity));
  document.querySelector("#dashTopCategory").textContent = topKey(groupSum(monthSales, (sale) => sale.category, (sale) => sale.total));

  drawBarChart("categoryChart", groupSum(monthSales, (sale) => sale.category, (sale) => sale.total), "Ventas");
  drawRecentChart(activeDate);
}

function renderClosure() {
  const data = getClosureData();
  document.querySelector("#closeTotal").textContent = money(data.totalSold);
  document.querySelector("#closeCash").textContent = money(data.cashTotal);
  document.querySelector("#closeYape").textContent = money(data.yapeTotal);
  document.querySelector("#closePlin").textContent = money(data.plinTotal);
  document.querySelector("#closeCard").textContent = money(data.cardTotal);
  document.querySelector("#closeTransfer").textContent = money(data.transferTotal);
  document.querySelector("#closeExpenses").textContent = money(data.expensesTotal);
  document.querySelector("#closeProfit").textContent = money(data.grossProfit);
}

function getClosureData() {
  const activeDate = getActiveDate();
  const daySales = state.sales.filter((sale) => sale.date === activeDate);
  const dayExpenses = state.expenses.filter((expense) => expense.date === activeDate);
  const paymentTotals = groupSum(daySales, (sale) => sale.payment, (sale) => sale.total);
  const total = sum(daySales, (sale) => sale.total);
  const expenses = sum(dayExpenses, (expense) => expense.amount);
  return {
    date: activeDate,
    totalSold: total,
    cashTotal: paymentTotals.Efectivo || 0,
    yapeTotal: paymentTotals.Yape || 0,
    plinTotal: paymentTotals.Plin || 0,
    cardTotal: paymentTotals.Tarjeta || 0,
    transferTotal: paymentTotals.Transferencia || 0,
    expensesTotal: expenses,
    grossProfit: total - expenses
  };
}

async function saveClosure() {
  await persistResource("closures", getClosureData());
  alert("Cierre diario guardado correctamente.");
}

function renderReports() {
  const start = document.querySelector("#reportStart").value || "0000-01-01";
  const end = document.querySelector("#reportEnd").value || "9999-12-31";
  const sales = state.sales.filter((sale) => sale.date >= start && sale.date <= end);
  const expenses = state.expenses.filter((expense) => expense.date >= start && expense.date <= end);
  const salesByDay = groupSum(sales, (sale) => sale.date, (sale) => sale.total);
  const expensesByCategory = groupSum(expenses, (expense) => expense.category, (expense) => expense.amount);
  const products = groupSum(sales, (sale) => sale.product, (sale) => sale.quantity);
  const totalSales = sum(sales, (sale) => sale.total);
  const totalExpenses = sum(expenses, (expense) => expense.amount);

  const cards = [
    ["Ventas del período", money(totalSales)],
    ["Gastos del período", money(totalExpenses)],
    ["Utilidad por período", money(totalSales - totalExpenses)],
    ["Días con ventas", Object.keys(salesByDay).length],
    ["Producto más vendido", topKey(products)],
    ["Gasto principal", topKey(expensesByCategory)]
  ];

  document.querySelector("#reportArea").innerHTML = cards.map(([label, value]) =>
    `<article class="report-card"><span>${label}</span><strong>${value}</strong></article>`
  ).join("");
}

function drawRecentChart(activeDate) {
  const reference = new Date(`${activeDate}T00:00:00`);
  const labels = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(reference);
    date.setDate(reference.getDate() - i);
    labels.push(date.toISOString().slice(0, 10));
  }
  const sales = {};
  const expenses = {};
  labels.forEach((label) => {
    sales[label] = sum(state.sales.filter((item) => item.date === label), (item) => item.total);
    expenses[label] = sum(state.expenses.filter((item) => item.date === label), (item) => item.amount);
  });
  drawGroupedChart("dailyChart", labels, sales, expenses);
}

function drawBarChart(canvasId, data, label) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, rect.width * window.devicePixelRatio);
  canvas.height = 260 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const entries = Object.entries(data);
  if (!entries.length) return drawEmptyCanvas(ctx, label);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  const width = rect.width || 420;
  const barWidth = Math.max(32, (width - 40) / entries.length - 14);
  entries.forEach(([name, value], index) => {
    const x = 22 + index * (barWidth + 14);
    const h = (value / max) * 150;
    const y = 190 - h;
    ctx.fillStyle = ["#b83236", "#198f7a", "#d49a28", "#3667a6", "#7c4d9d"][index % 5];
    ctx.fillRect(x, y, barWidth, h);
    ctx.fillStyle = "#241f1b";
    ctx.font = "12px Arial";
    ctx.fillText(name.slice(0, 12), x, 216);
    ctx.fillText(money(value), x, y - 8);
  });
}

function drawGroupedChart(canvasId, labels, sales, expenses) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, rect.width * window.devicePixelRatio);
  canvas.height = 260 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...labels.flatMap((label) => [sales[label], expenses[label]]), 1);
  const width = rect.width || 420;
  const groupWidth = (width - 34) / labels.length;
  labels.forEach((label, index) => {
    const x = 18 + index * groupWidth;
    const saleHeight = (sales[label] / max) * 145;
    const expenseHeight = (expenses[label] / max) * 145;
    ctx.fillStyle = "#198f7a";
    ctx.fillRect(x, 190 - saleHeight, Math.max(10, groupWidth * 0.28), saleHeight);
    ctx.fillStyle = "#b83236";
    ctx.fillRect(x + Math.max(12, groupWidth * 0.32), 190 - expenseHeight, Math.max(10, groupWidth * 0.28), expenseHeight);
    ctx.fillStyle = "#241f1b";
    ctx.font = "11px Arial";
    ctx.fillText(label.slice(5), x, 216);
  });
  ctx.fillStyle = "#198f7a";
  ctx.fillRect(18, 238, 12, 12);
  ctx.fillStyle = "#241f1b";
  ctx.fillText("Ventas", 36, 248);
  ctx.fillStyle = "#b83236";
  ctx.fillRect(96, 238, 12, 12);
  ctx.fillStyle = "#241f1b";
  ctx.fillText("Gastos", 114, 248);
}

function drawEmptyCanvas(ctx, label) {
  ctx.fillStyle = "#746b61";
  ctx.font = "14px Arial";
  ctx.fillText(`Sin datos para ${label.toLowerCase()}`, 18, 42);
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}">${message}</td></tr>`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameCode(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportTable(type) {
  const maps = {
    sales: {
      filename: "ventas.csv",
      rows: state.sales,
      columns: ["date", "time", "productCode", "product", "category", "quantity", "price", "total", "payment"]
    },
    products: {
      filename: "productos.csv",
      rows: state.products,
      columns: ["code", "name", "category", "price", "cost", "status"]
    },
    expenses: {
      filename: "gastos.csv",
      rows: state.expenses,
      columns: ["date", "description", "category", "amount"]
    },
    inventory: {
      filename: "inventario.csv",
      rows: state.inventory,
      columns: ["name", "stock", "minimum", "unit", "cost"]
    }
  };
  const config = maps[type];
  downloadCsv(config.filename, config.columns, config.rows);
}

function exportClosure() {
  const activeDate = getActiveDate();
  const rows = [{
    fecha: activeDate,
    total_vendido: document.querySelector("#closeTotal").textContent,
    efectivo: document.querySelector("#closeCash").textContent,
    yape: document.querySelector("#closeYape").textContent,
    plin: document.querySelector("#closePlin").textContent,
    tarjeta: document.querySelector("#closeCard").textContent,
    transferencia: document.querySelector("#closeTransfer").textContent,
    gastos: document.querySelector("#closeExpenses").textContent,
    utilidad: document.querySelector("#closeProfit").textContent
  }];
  downloadCsv(`cierre-${activeDate}.csv`, Object.keys(rows[0]), rows);
}

function exportReportCsv() {
  const start = document.querySelector("#reportStart").value;
  const end = document.querySelector("#reportEnd").value;
  const rows = [
    ...state.sales.filter((sale) => sale.date >= start && sale.date <= end).map((sale) => ({ tipo: "Venta", fecha: sale.date, categoria: sale.category, detalle: sale.product, monto: sale.total })),
    ...state.expenses.filter((expense) => expense.date >= start && expense.date <= end).map((expense) => ({ tipo: "Gasto", fecha: expense.date, categoria: expense.category, detalle: expense.description, monto: expense.amount }))
  ];
  downloadCsv(`reporte-${start}-a-${end}.csv`, ["tipo", "fecha", "categoria", "detalle", "monto"], rows);
}

async function importProductsFromExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  showProductImportStatus("Leyendo archivo Excel...");
  try {
    const rows = await readXlsxRows(file);
    const result = await upsertImportedProducts(rows);
    await refreshState();
    showProductImportStatus(`Importación completa: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} omitidos.`);
  } catch (error) {
    showProductImportStatus(`No se pudo importar el archivo: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function showProductImportStatus(message) {
  const status = document.querySelector("#productImportStatus");
  status.textContent = message;
  status.classList.remove("hidden");
}

async function upsertImportedProducts(rows) {
  const result = { created: 0, updated: 0, skipped: 0 };
  for (const row of rows) {
    const product = productFromImportedRow(row);
    if (!product) {
      result.skipped += 1;
      continue;
    }
    const existing = state.products.find((item) => sameCode(item.code, product.code));
    await persistResource("products", { ...product, id: existing?.id || uid("product") });
    if (existing) result.updated += 1;
    else result.created += 1;
  }
  return result;
}

function productFromImportedRow(row) {
  const code = readImportedValue(row, ["codigo", "código", "code"]);
  const name = readImportedValue(row, ["nombre", "producto", "name"]);
  const category = readImportedValue(row, ["categoria", "categoría", "category"]);
  const price = parseNumber(readImportedValue(row, ["precio de venta", "precio venta", "precio", "price"]));
  const cost = parseNumber(readImportedValue(row, ["costo", "cost"]));
  const status = readImportedValue(row, ["estado", "status"]) || "Activo";
  if (!code || !name || !category || Number.isNaN(price)) return null;
  return {
    code: String(code).trim(),
    name: String(name).trim(),
    category: String(category).trim(),
    price,
    cost: Number.isNaN(cost) ? 0 : cost,
    status: normalizeText(status) === "inactivo" ? "Inactivo" : "Activo"
  };
}

function readImportedValue(row, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    const key = Object.keys(row).find((candidate) => normalizeText(candidate) === normalizedAlias);
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return "";
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const clean = String(value || "").replace("S/", "").replace(",", ".").trim();
  return Number(clean);
}

async function readXlsxRows(file) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Tu navegador no permite leer .xlsx directamente. Usa una versión actual de Chrome o Edge.");
  }
  const entries = await unzipXlsx(await file.arrayBuffer());
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"] || "");
  const sheetPath = resolveFirstSheetPath(entries);
  const sheetXml = entries[sheetPath];
  if (!sheetXml) throw new Error("No encontré la primera hoja del Excel.");
  return parseWorksheetRows(sheetXml, sharedStrings);
}

async function unzipXlsx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = {};

  for (let i = 0; i < entryCount; i += 1) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decodeBytes(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    entries[name] = await readZipEntry(bytes, view, localHeaderOffset, compressedSize, method);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes) {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      return i;
    }
  }
  throw new Error("El archivo no parece ser un .xlsx válido.");
}

async function readZipEntry(bytes, view, localHeaderOffset, compressedSize, method) {
  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + compressedSize);
  if (method === 0) return decodeBytes(compressed);
  if (method !== 8) return "";
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return decodeBytes(new Uint8Array(inflated));
}

function decodeBytes(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function resolveFirstSheetPath(entries) {
  const workbookXml = entries["xl/workbook.xml"];
  const relsXml = entries["xl/_rels/workbook.xml.rels"];
  if (!workbookXml || !relsXml) return "xl/worksheets/sheet1.xml";
  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  const firstSheet = workbook.querySelector("sheet");
  const relId = firstSheet?.getAttribute("r:id");
  const rel = [...rels.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relId);
  const target = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("si")].map((item) =>
    [...item.querySelectorAll("t")].map((text) => text.textContent || "").join("")
  );
}

function parseWorksheetRows(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rawRows = [...doc.querySelectorAll("sheetData row")].map((row) => {
    const values = [];
    [...row.querySelectorAll("c")].forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const index = columnIndex(ref.replace(/[0-9]/g, ""));
      values[index] = cellValue(cell, sharedStrings);
    });
    return values;
  }).filter((row) => row.some((value) => value !== ""));

  if (!rawRows.length) return [];
  const headers = rawRows[0].map((value) => String(value || "").trim());
  return rawRows.slice(1).map((row) => {
    return headers.reduce((acc, header, index) => {
      if (header) acc[header] = row[index] ?? "";
      return acc;
    }, {});
  });
}

function columnIndex(letters) {
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return [...cell.querySelectorAll("is t")].map((item) => item.textContent || "").join("");
  const raw = cell.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(raw)] || "";
  return raw;
}

function printView(className) {
  document.body.classList.remove("print-close", "print-report");
  document.body.classList.add(className);
  window.print();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(`respaldo-la-torteria-${today()}.json`, blob);
}

function downloadCsv(filename, columns, rows) {
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replaceAll('"', '""')}"`).join(","))
  ].join("\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function seedExampleData() {
  if (state.sales.length || state.expenses.length || state.inventory.length) {
    if (!confirm("Esto agregará datos de ejemplo a los datos actuales. ¿Continuar?")) return;
  }
  const base = getActiveDate();
  const productExamples = [
    { id: uid("product"), code: "T001", name: "Torta de chocolate", category: "Tortas", price: 65, cost: 38, status: "Activo" },
    { id: uid("product"), code: "M001", name: "Marciano de fresa", category: "Marcianos", price: 2.5, cost: 1.2, status: "Activo" },
    { id: uid("product"), code: "P001", name: "Postre tres leches", category: "Postres", price: 8, cost: 4.2, status: "Activo" }
  ];
  const sales = [
    { id: uid("sale"), date: base, time: "09:15", productId: productExamples[0].id, productCode: "T001", product: "Torta de chocolate", category: "Tortas", quantity: 2, price: 65, total: 130, payment: "Yape" },
    { id: uid("sale"), date: base, time: "11:40", productId: productExamples[1].id, productCode: "M001", product: "Marciano de fresa", category: "Marcianos", quantity: 8, price: 2.5, total: 20, payment: "Efectivo" },
    { id: uid("sale"), date: base, time: "15:10", productId: productExamples[2].id, productCode: "P001", product: "Postre tres leches", category: "Postres", quantity: 5, price: 8, total: 40, payment: "Plin" }
  ];
  const expenses = [
    { id: uid("expense"), date: base, description: "Huevos y leche", category: "Insumos", amount: 38 },
    { id: uid("expense"), date: base, description: "Movilidad de entrega", category: "Transporte", amount: 12 }
  ];
  const inventory = [
    { id: uid("stock"), name: "Harina", stock: 8, minimum: 5, unit: "kg", cost: 32 },
    { id: uid("stock"), name: "Huevos", stock: 18, minimum: 24, unit: "unidades", cost: 14 },
    { id: uid("stock"), name: "Envases", stock: 40, minimum: 30, unit: "unidades", cost: 25 }
  ];
  for (const product of productExamples) await persistResource("products", product);
  for (const sale of sales) await persistResource("sales", sale);
  for (const expense of expenses) await persistResource("expenses", expense);
  if (currentUser?.role === "admin") {
    for (const item of inventory) await persistResource("inventory", item);
  }
  await refreshState();
}

window.addEventListener("resize", renderDashboard);
initialize();
