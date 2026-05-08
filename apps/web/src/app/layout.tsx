import { Geist_Mono, Nunito_Sans } from "next/font/google";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/providers/query-provider";

import type { Metadata } from "next";

const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "UniHub Workshop",
  description: "Hệ thống đăng ký và quản lý workshop cho sinh viên",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        nunitoSans.variable,
        "h-full"
      )}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
