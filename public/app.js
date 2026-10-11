const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value) => new Intl.NumberFormat("vi-VN").format(Number(value || 0));
const dateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : ""));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const symbolFor = (category = "") => {
  const text = category.toLowerCase();
  if (text.includes("âm thanh") || text.includes("tai nghe")) return "♫";
  if (text.includes("cáp")) return "⌁";
  if (text.includes("phụ kiện")) return "⌘";
  return "▦";
};
let products = [];
let stats = {};
let currentView = "overview";
let toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Không thể kết nối máy chủ.");
  return payload;
}
function toast(message, isError = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", isError);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3000);
}
function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const labels = { overview: ["Tổng quan", "Tổng quan kho", "Theo dõi tình hình hàng hóa của bạn trong một nơi."], products: ["Sản phẩm", "Danh sách sản phẩm", "Tìm kiếm, cập nhật và quản lý danh mục hàng hóa."], transactions: ["Lịch sử kho", "Lịch sử giao dịch", "Theo dõi các lần nhập và xuất kho."] };
  const [crumb, title, subtitle] = labels[view];
  $("#breadcrumbTitle").textContent = crumb;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
  $("#statsGrid").hidden = view !== "overview";
  $(".content-grid").hidden = view === "transactions";
  $("#tableTitle").textContent = view === "products" ? "Tất cả sản phẩm" : "Danh sách sản phẩm";
  $("#viewAllBtn").hidden = view === "products";
  $(".low-stock-panel").hidden = view !== "overview";
  if (view === "transactions") openTransactions();
  if (view === "products") renderProducts(products);
}
async function loadAll() {
  try {
    const [productData, statsData, transactionData] = await Promise.all([
      api("/api/products"),
      api("/api/stats"),
      api("/api/transactions?limit=6")
    ]);
    products = productData;
    stats = statsData;
    renderStats(statsData);
    renderProducts(filterProducts());
    renderTransactions(transactionData, $("#recentTransactions"));
    renderLowStock(productData);
    $("#navProductCount").textContent = productData.length;
    $("#todayLabel").textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
    $("#tableFooter").textContent = `${productData.length} mặt hàng · Dữ liệu lưu trong SQLite`;
  } catch (error) {
    toast(error.message, true);
  }
}
function renderStats(data) {
  $("#statProducts").textContent = number(data.product_count);
  $("#statUnits").textContent = number(data.total_units);
  $("#statValue").textContent = money(data.inventory_value);
  $("#statLow").textContent = number(data.low_stock_count);
  $("#lowStockBadge").textContent = `${number(data.low_stock_count)} mặt hàng`;
}
function filterProducts() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return products.filter((product) => [product.name, product.sku, product.category].some((value) => String(value || "").toLowerCase().includes(query)));
}
function renderProducts(items) {
  $("#resultCount").textContent = `${number(items.length)} sản phẩm`;
  if (!items.length) {
    $("#productRows").innerHTML = `<tr><td colspan="6" class="empty-cell">Không tìm thấy sản phẩm phù hợp.</td></tr>`;
    return;
  }
  $("#productRows").innerHTML = items.map((product) => {
    const low = product.quantity <= product.min_stock;
    return `<tr>
      <td><div class="product-cell"><span class="product-symbol">${symbolFor(product.category)}</span><span><span class="product-name">${escapeHtml(product.name)}</span><span class="product-category">${escapeHtml(product.category)}</span></span></div></td>
      <td><span class="sku">${escapeHtml(product.sku)}</span></td>
      <td>${escapeHtml(product.category)}</td>
      <td><span class="stock-pill ${low ? "low" : "good"}"><i></i>${number(product.quantity)} ${low ? "Sắp hết" : "Trong kho"}</span></td>
      <td><span class="price">${money(product.unit_price)}</span></td>
      <td><div class="row-actions"><button class="mini-button" data-stock="${product.id}" title="Nhập/xuất kho">± Kho</button><button class="mini-button" data-edit="${product.id}" title="Sửa sản phẩm">Sửa</button></div></td>
    </tr>`;
  }).join("");
}
function renderTransactions(items, target) {
  if (!items.length) {
    target.innerHTML = `<div class="empty-activity">Chưa có giao dịch kho.</div>`;
    return;
  }
  target.innerHTML = items.map((item) => `<div class="activity-item">
    <span class="activity-icon ${item.type}">${item.type === "in" ? "↓" : "↑"}</span>
    <div class="activity-copy"><strong>${escapeHtml(item.product_name)}</strong><small>${item.type === "in" ? "Nhập kho" : "Xuất kho"} · ${dateTime(item.created_at)}</small></div>
    <span class="activity-qty ${item.type}">${item.type === "in" ? "+" : "−"}${number(item.quantity)}</span>
  </div>`).join("");
}
function renderLowStock(items) {
  const lowItems = items.filter((product) => product.quantity <= product.min_stock);
  if (!lowItems.length) {
    $("#lowStockList").innerHTML = `<p class="empty-cell">Tuyệt vời! Không có mặt hàng nào cần bổ sung.</p>`;
    return;
  }
  $("#lowStockList").innerHTML = lowItems.slice(0, 6).map((product) => `<div class="low-stock-item">
    <span class="product-symbol">${symbolFor(product.category)}</span><div class="low-stock-info"><strong>${escapeHtml(product.name)}</strong><small>Ngưỡng tối thiểu: ${number(product.min_stock)}</small></div><span class="low-stock-number">${number(product.quantity)} còn lại</span>
  </div>`).join("");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function openProductDialog(product = null) {
  $("#productForm").reset();
  $("#productId").value = product?.id || "";
  $("#productDialogTitle").textContent = product ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm";
  $("#productName").value = product?.name || "";
  $("#productSku").value = product?.sku || "";
  $("#productCategory").value = product?.category || "Phụ kiện";
  $("#productQuantity").value = product?.quantity ?? 0;
  $("#productMinStock").value = product?.min_stock ?? 5;
  $("#productPrice").value = product?.unit_price ?? 0;
  $("#productQuantity").disabled = Boolean(product);
  $("#initialQuantityLabel").firstChild.textContent = product ? "Số lượng hiện tại (quản lý qua giao dịch) " : "Số lượng ban đầu ";
  $("#editHint").textContent = product ? "Để đảm bảo lịch sử chính xác, hãy dùng nút ± Kho để thay đổi số lượng." : "Mã SKU phải là duy nhất. Giá nhập dùng để ước tính giá trị tồn kho.";
  $("#productDialog").showModal();
}
async function submitProduct(event) {
  event.preventDefault();
  const id = $("#productId").value;
  const body = {
    name: $("#productName").value.trim(),
    sku: $("#productSku").value.trim(),
    category: $("#productCategory").value.trim() || "Khác",
    quantity: Number($("#productQuantity").value),
    min_stock: Number($("#productMinStock").value),
    unit_price: Number($("#productPrice").value)
  };
  try {
    await api(id ? `/api/products/${id}` : "/api/products", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    $("#productDialog").close();
    toast(id ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.");
    await loadAll();
  } catch (error) { toast(error.message, true); }
}
function openStockDialog(id) {
  const product = products.find((item) => item.id === Number(id));
  if (!product) return;
  $("#stockForm").reset();
  $("#stockProductId").value = product.id;
  $("#selectedProduct").innerHTML = `${escapeHtml(product.name)} <small>SKU: ${escapeHtml(product.sku)} · Tồn hiện tại: ${number(product.quantity)}</small>`;
  $("#stockDialog").showModal();
}
async function submitStock(event) {
  event.preventDefault();
  const id = $("#stockProductId").value;
  const body = { type: $("#stockType").value, quantity: Number($("#stockQuantity").value), note: $("#stockNote").value.trim() };
  try {
    await api(`/api/products/${id}/stock`, { method: "POST", body: JSON.stringify(body) });
    $("#stockDialog").close();
    toast(body.type === "in" ? "Đã ghi nhận nhập kho." : "Đã ghi nhận xuất kho.");
    await loadAll();
  } catch (error) { toast(error.message, true); }
}
async function openTransactions() {
  try {
    const items = await api("/api/transactions?limit=200");
    $("#transactionRows").innerHTML = items.length ? items.map((item) => `<tr><td><strong>${escapeHtml(item.product_name)}</strong><br><span class="sku">${escapeHtml(item.sku)}</span></td><td><span class="stock-pill ${item.type === "in" ? "good" : "low"}">${item.type === "in" ? "Nhập kho" : "Xuất kho"}</span></td><td>${item.type === "in" ? "+" : "−"}${number(item.quantity)}</td><td>${escapeHtml(item.note || "—")}</td><td>${dateTime(item.created_at)}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-cell">Chưa có giao dịch.</td></tr>`;
    $("#transactionsDialog").showModal();
  } catch (error) { toast(error.message, true); }
}

$("#productForm").addEventListener("submit", submitProduct);
$("#stockForm").addEventListener("submit", submitStock);
$("#addProductBtn").addEventListener("click", () => openProductDialog());
$("#refreshBtn").addEventListener("click", loadAll);
$("#searchInput").addEventListener("input", () => renderProducts(filterProducts()));
$("#viewAllBtn").addEventListener("click", () => setView("products"));
$("#viewTransactionsBtn").addEventListener("click", () => setView("transactions"));
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.close).close()));
$("#productRows").addEventListener("click", (event) => {
  const stockButton = event.target.closest("[data-stock]");
  const editButton = event.target.closest("[data-edit]");
  if (stockButton) openStockDialog(stockButton.dataset.stock);
  if (editButton) {
    const product = products.find((item) => item.id === Number(editButton.dataset.edit));
    if (product) openProductDialog(product);
  }
});
$("#stockType").addEventListener("change", () => {
  $("#stockDialogTitle").textContent = $("#stockType").value === "in" ? "Nhập kho" : "Xuất kho";
});
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));
loadAll();
