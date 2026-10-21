# Review365 — Báo cáo Google Business Profile

Chấm điểm hồ sơ Google Business Profile theo checklist 20 mục của REVIEW365, từ dữ liệu crawl công khai Google Maps (Apify).

## Chạy

```bash
pnpm install
cp .env.example .env.local   # rồi điền APIFY_TOKEN
pnpm dev                     # http://localhost:3000
```

`APIFY_TOKEN` (lấy ở https://console.apify.com/settings/integrations) chỉ nằm trên server, không bao giờ gửi xuống trình duyệt.
`NEXT_PUBLIC_SIGNUP_URL` là link trang đăng ký Review365, gắn vào nút CTA dưới các tiêu chí bị khoá.
Sửa `.env.local` xong cần khởi động lại `pnpm dev`.

## Dùng

1. Dán **link Google Maps** của cửa hàng (`maps.app.goo.gl/…`, `google.com/maps/place/…`, link có `query_place_id`, hoặc place id).
2. Bấm **Chấm điểm** — app khởi chạy actor `compass~crawler-google-places` và theo dõi đến khi xong
   (thường 30 giây – 2 phút) rồi hiện báo cáo.

## Chi phí crawl

Mỗi lần crawl chỉ lấy 1 địa điểm kèm trang chi tiết và **1 review mới nhất** (`maxReviews: 1`, `reviewsSort: newest`, để chấm tần suất đánh giá); **không** lấy ảnh, liên hệ (`maxImages: 0`) —
những mục cần các dữ liệu đó hiện "Không đo được" và không tính vào điểm.

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/lib/audit.ts` | Logic chấm điểm (hàm thuần) |
| `src/components/Report.tsx` | Giao diện báo cáo |
| `src/components/ReportApp.tsx` | Trang chính: nhập link, chờ crawl, hiện báo cáo |
| `src/lib/maps-link.ts` | Nhận diện link Google Maps, mở link rút gọn |
| `src/lib/apify.ts` | Gọi Apify API (chỉ chạy trên server) |
| `src/app/api/crawl/route.ts` | `POST` — khởi chạy crawl, trả `runId` |
| `src/app/api/crawl/[runId]/route.ts` | `GET` — trạng thái run; xong thì trả dữ liệu |
