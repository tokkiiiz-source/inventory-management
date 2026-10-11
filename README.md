# KhoFlow — Inventory Management

Ứng dụng quản lý kho nhỏ sử dụng **Node.js, Express, SQLite, HTML, CSS và JavaScript thuần**.

## Tính năng

- Dashboard: tổng số mặt hàng, tổng số lượng, giá trị tồn kho và cảnh báo hàng thấp.
- Thêm sản phẩm và chỉnh sửa thông tin sản phẩm.
- Tìm kiếm theo tên, SKU hoặc danh mục.
- Ghi nhận nhập kho và xuất kho; không cho xuất vượt tồn hiện tại.
- Lịch sử giao dịch kho.
- Dữ liệu lưu bền vững trong SQLite (`inventory.db`).
- Giao diện responsive cho desktop và điện thoại.

## Yêu cầu

- Node.js (khuyến nghị bản LTS hiện hành).
- npm đi kèm Node.js.

## Chạy trên Windows / PowerShell

1. Giải nén thư mục dự án.
2. Mở Terminal trong thư mục có `package.json`.
3. Cài thư viện:

   ```powershell
   npm.cmd install
   ```

4. Chạy ứng dụng:

   ```powershell
   node server.js
   ```

5. Mở trình duyệt tại <http://localhost:3000>.

Dừng server bằng `Ctrl + C`.

> Nếu PowerShell báo rằng chạy script bị vô hiệu hóa khi dùng `npm`, hãy thử `npm.cmd` như hướng dẫn trên. Không cần đổi Execution Policy.

## API chính

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/health` | Kiểm tra server |
| GET | `/api/products` | Lấy danh sách sản phẩm |
| GET | `/api/products?search=chuột` | Tìm kiếm sản phẩm |
| POST | `/api/products` | Thêm sản phẩm |
| PUT | `/api/products/:id` | Cập nhật thông tin |
| DELETE | `/api/products/:id` | Xóa sản phẩm chưa có lịch sử giao dịch |
| POST | `/api/products/:id/stock` | Nhập hoặc xuất kho |
| GET | `/api/transactions` | Lịch sử giao dịch |
| GET | `/api/stats` | Số liệu dashboard |

### Ví dụ body để tạo sản phẩm

```json
{
  "name": "Màn hình 24 inch",
  "sku": "MON-024",
  "category": "Màn hình",
  "quantity": 10,
  "min_stock": 3,
  "unit_price": 2500000
}
```

### Ví dụ body để nhập kho

```json
{
  "type": "in",
  "quantity": 5,
  "note": "Nhập từ nhà cung cấp"
}
```

Dùng `"type": "out"` để xuất kho.

## Cấu trúc thư mục

```text
inventory-management/
├── package.json
├── server.js
├── inventory.db       # tự tạo khi server chạy
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## Ghi chú học tập

Đây là dự án portfolio học tập, chưa được thiết kế để làm hệ thống thương mại nhiều người dùng. Trước khi sử dụng trong môi trường kinh doanh thật, nên bổ sung xác thực người dùng, phân quyền, sao lưu dữ liệu, kiểm thử tự động, logging và biện pháp bảo mật triển khai.
