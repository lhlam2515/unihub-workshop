import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export const getCorsConfig = (): CorsOptions => {
  const allowedWebOrigins = [
    "http://localhost:5173", // Vite Dev Server
    "http://localhost:4173", // Vite Preview
    process.env.FRONTEND_URL, // Production Web Portal
  ].filter(Boolean) as string[];

  return {
    origin: (origin, callback) => {
      // TRƯỜNG HỢP 1: Mobile App hoặc Server-to-Server
      // Các client này thường không đính kèm header Origin. Chúng ta cho phép đi qua.
      if (!origin) {
        return callback(null, true);
      }

      // TRƯỜNG HỢP 2: Web App
      // Kiểm tra xem Origin của trình duyệt có nằm trong Whitelist không
      if (allowedWebOrigins.includes(origin)) {
        return callback(null, true);
      }

      // TRƯỜNG HỢP 3: Bị chặn
      // Các trang web lạ cố tình gọi API sẽ bị từ chối
      callback(new Error("Not allowed by CORS"), false);
    },

    // Bắt buộc = true để trình duyệt cho phép gửi Cookie (dùng cho luồng Refresh Token)
    credentials: true,

    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Idempotency-Key", // HEADER QUAN TRỌNG: Mở khóa cho cơ chế chống trừ tiền đúp
    ],
  };
};
