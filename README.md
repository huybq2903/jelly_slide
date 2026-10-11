# project-h — Jelly Slide: Block Puzzle

Tên hiển thị của game: **Jelly Slide** (tên đầy đủ trên store: *Jelly Slide: Block Puzzle*). Puzzle trượt khối thạch, vệt thạch chặn đường rồi tự chảy xẹp và tan. `project-h` chỉ là tên package/thư mục; `gameId` của SDK do Falcon IDE đặt theo package name lúc publish, đừng đổi tên package để đổi tên game.

Game web của Falcon, khung chuẩn: Vite + TypeScript + `@falcongames/game-client-sdk`.

```bash
npm install
npm run dev      # hoặc mở Preview trong Falcon IDE
npm run build    # dist/index.html — một tệp duy nhất
```

- `src/game.ts` thực hiện hợp đồng `FalconGame`; `registerFalconGame` (trong `src/falcon-game.ts`)
  tự nối phần LUÔN BẬT của SDK: bridge với shell app, save (`userData`) và analytics `log_level`.
- Các tính năng tuỳ chọn (quảng cáo, shop/IAP, lives, remove-ads, booster) KHÔNG dựng sẵn: khi cần, game tự
  làm UI theo design riêng và gọi SDK (`SDK.ads.*`, `SDK.shop.*`, …). Xem `CLAUDE.md` — file đó hướng dẫn
  AI làm đúng cách khi bạn nhờ nó viết.
- Lúc Submit, công tắc shop/ads trên CMS quyết định module nào bật trong bản phát hành; IDE kiểm chứng
  bản build trong trình duyệt thật trước khi gửi.
- `gameId` của SDK KHÔNG nằm trong source: lúc Publish, Falcon IDE đặt nó bằng **package name** của game
  (`VITE_FALCON_GAME_ID`). Lúc develop nó là `dev`.
- UI (HUD, popup thắng/thua; nút chơi lại chơi lại ngay, không hỏi xác nhận) do game tự vẽ theo phong cách Len hộp; template của studio chỉ dùng làm mẫu bố cục.
- Bàn chơi vẽ bằng 3D thật (Three.js) trong `src/scene3d.ts`, vật liệu thạch dựng trong `src/scene3d.ts` (`src/wool.ts` chỉ còn vật liệu cửa); giao diện 2D là lớp canvas phủ lên trên.
- Số liệu của lớp studio (coin thắng, giá hồi sinh, cổng ads, lives…) đặt trong `.falcon/sdk-config.json`.
