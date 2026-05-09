/**
 * Known test data constants matching seed.ts output.
 *
 * Since seed.ts uses deterministic values, these constants correspond to
 * the Nth element in each seed array.
 */
export const TEST = {
  student: {
    id: "21127001",
    name: "Nguyễn Văn An",
    password: "student123",
  },

  admin: {
    email: "hoang.lam@unihub.edu.vn",
    password: "admin123",
  },

  workshops: {
    /** Workshop 0: paid, OPEN, 50 seats */
    aiInEducation: {
      title: "AI trong Giáo dục Đại học: Cơ hội và Thách thức",
      seats: 50,
      price: "50000",
      status: "OPEN",
    },
    /** Workshop 1: free, OPEN, 80 seats */
    cybersecurity: {
      title: "Bảo mật Thông tin trong Thời đại Số",
      seats: 80,
      price: "0",
      status: "OPEN",
    },
    /** Workshop 2: past, COMPLETED, paid */
    cloud: {
      title: "Cloud Computing & Ứng dụng Thực tế",
      status: "COMPLETED",
    },
    /** Workshop 3: past, COMPLETED, free */
    startup: {
      title: "Khởi nghiệp Công nghệ: Từ Ý tưởng đến Thực tế",
      status: "COMPLETED",
    },
    /** Workshop 4: paid, OPEN, 30 seats */
    uxUi: {
      title: "Thiết kế UX/UI cho Ứng dụng Di động",
      seats: 30,
      price: "150000",
      status: "OPEN",
    },
    /** Workshop 5: DRAFT */
    blockchain: {
      title: "Blockchain & Tương lai Tài chính Số",
      status: "DRAFT",
    },
  },

  speakers: [
    "PGS.TS Nguyễn Đức Hoàng",
    "TS. Lê Thị Minh Tâm",
    "ThS. Trần Văn Hùng",
    "Mr. John Smith",
    "ThS. Phạm Thị Lan",
  ],

  rooms: ["A101", "A201", "B102 (Phòng Lab)", "Hội trường B"],
};
