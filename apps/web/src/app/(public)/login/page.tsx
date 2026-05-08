import { AuthForm } from "@/features/auth/components/AuthForm";

export default function StudentLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Đăng nhập</h1>
          <p className="text-muted-foreground text-sm">Sinh viên</p>
        </div>
        <AuthForm variant="student" />
      </div>
    </div>
  );
}
