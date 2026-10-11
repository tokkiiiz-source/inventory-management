const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "inventory.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'Khác',
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_stock INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
    unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
  );
`);

const count = db.prepare("SELECT COUNT(*) AS total FROM products").get().total;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, sku, category, quantity, min_stock, unit_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const samples = [
    ["Bàn phím cơ", "KB-001", "Phụ kiện", 18, 5, 650000],
    ["Chuột không dây", "MS-002", "Phụ kiện", 7, 5, 320000],
    ["Tai nghe", "HP-003", "Âm thanh", 3, 5, 490000],
    ["Cáp USB-C", "CB-004", "Cáp kết nối", 24, 8, 90000]
  ];
  const seed = db.transaction((rows) => rows.forEach((row) => insert.run(...row)));
  seed(samples);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const allProducts = db.prepare(`
  SELECT p.*,
    COALESCE((SELECT SUM(quantity) FROM stock_transactions t WHERE t.product_id = p.id AND t.type = 'in'), 0) AS total_in,
    COALESCE((SELECT SUM(quantity) FROM stock_transactions t WHERE t.product_id = p.id AND t.type = 'out'), 0) AS total_out
  FROM products p
`);

function getProduct(id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/products", (req, res) => {
  const search = String(req.query.search || "").trim();
  const rows = search
    ? db.prepare(`
        SELECT * FROM products
        WHERE name LIKE ? OR sku LIKE ? OR category LIKE ?
        ORDER BY id DESC
      `).all(`%${search}%`, `%${search}%`, `%${search}%`)
    : allProducts.all();
  res.json(rows);
});

app.post("/api/products", (req, res) => {
  const name = String(req.body.name || "").trim();
  const sku = String(req.body.sku || "").trim().toUpperCase();
  const category = String(req.body.category || "Khác").trim() || "Khác";
  const quantity = Number(req.body.quantity);
  const minStock = Number(req.body.min_stock ?? 5);
  const unitPrice = Number(req.body.unit_price ?? 0);

  if (!name || !sku) return res.status(400).json({ error: "Tên sản phẩm và mã SKU là bắt buộc." });
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: "Số lượng phải là số nguyên không âm." });
  if (!Number.isInteger(minStock) || minStock < 0) return res.status(400).json({ error: "Mức tồn tối thiểu phải là số nguyên không âm." });
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return res.status(400).json({ error: "Giá nhập không hợp lệ." });

  try {
    const result = db.prepare(`
      INSERT INTO products (name, sku, category, quantity, min_stock, unit_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, sku, category, quantity, minStock, unitPrice);
    const product = getProduct(result.lastInsertRowid);
    if (quantity > 0) {
      db.prepare("INSERT INTO stock_transactions (product_id, type, quantity, note) VALUES (?, 'in', ?, ?)")
        .run(product.id, quantity, "Số lượng khởi tạo");
    }
    res.status(201).json(product);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "Mã SKU đã tồn tại." });
    res.status(500).json({ error: "Không thể tạo sản phẩm." });
  }
});

app.put("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const product = getProduct(id);
  if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });

  const name = String(req.body.name || "").trim();
  const sku = String(req.body.sku || "").trim().toUpperCase();
  const category = String(req.body.category || "Khác").trim() || "Khác";
  const minStock = Number(req.body.min_stock);
  const unitPrice = Number(req.body.unit_price);

  if (!name || !sku) return res.status(400).json({ error: "Tên sản phẩm và mã SKU là bắt buộc." });
  if (!Number.isInteger(minStock) || minStock < 0) return res.status(400).json({ error: "Mức tồn tối thiểu phải là số nguyên không âm." });
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return res.status(400).json({ error: "Giá nhập không hợp lệ." });

  try {
    db.prepare("UPDATE products SET name=?, sku=?, category=?, min_stock=?, unit_price=? WHERE id=?")
      .run(name, sku, category, minStock, unitPrice, id);
    res.json(getProduct(id));
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "Mã SKU đã tồn tại." });
    res.status(500).json({ error: "Không thể cập nhật sản phẩm." });
  }
});

app.delete("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!getProduct(id)) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
  const hasTransactions = db.prepare("SELECT COUNT(*) AS total FROM stock_transactions WHERE product_id=?").get(id).total;
  if (hasTransactions > 0) return res.status(409).json({ error: "Sản phẩm đã có lịch sử kho nên không thể xóa. Bạn có thể chỉnh sửa sản phẩm thay thế." });
  db.prepare("DELETE FROM products WHERE id=?").run(id);
  res.json({ success: true });
});

app.post("/api/products/:id/stock", (req, res) => {
  const id = Number(req.params.id);
  const type = req.body.type;
  const quantity = Number(req.body.quantity);
  const note = String(req.body.note || "").trim();
  const product = getProduct(id);

  if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
  if (!["in", "out"].includes(type)) return res.status(400).json({ error: "Loại giao dịch không hợp lệ." });
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: "Số lượng giao dịch phải là số nguyên lớn hơn 0." });
  if (type === "out" && quantity > product.quantity) return res.status(400).json({ error: "Số lượng xuất vượt quá tồn kho hiện tại." });

  const update = db.prepare("UPDATE products SET quantity = quantity + ? WHERE id = ?");
  const transaction = db.prepare("INSERT INTO stock_transactions (product_id, type, quantity, note) VALUES (?, ?, ?, ?)");
  const apply = db.transaction(() => {
    update.run(type === "in" ? quantity : -quantity, id);
    transaction.run(id, type, quantity, note);
  });
  apply();
  res.status(201).json(getProduct(id));
});

app.get("/api/transactions", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = db.prepare(`
    SELECT t.*, p.name AS product_name, p.sku
    FROM stock_transactions t
    JOIN products p ON p.id = t.product_id
    ORDER BY t.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.get("/api/stats", (_req, res) => {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS product_count,
      COALESCE(SUM(quantity), 0) AS total_units,
      COALESCE(SUM(quantity * unit_price), 0) AS inventory_value,
      SUM(CASE WHEN quantity <= min_stock THEN 1 ELSE 0 END) AS low_stock_count
    FROM products
  `).get();
  const recent = db.prepare(`
    SELECT t.*, p.name AS product_name, p.sku
    FROM stock_transactions t JOIN products p ON p.id=t.product_id
    ORDER BY t.id DESC LIMIT 6
  `).all();
  res.json({ ...summary, recent });
});

app.use("/api", (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ." });
});

app.listen(PORT, () => {
  console.log(`Inventory Management is running at http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
