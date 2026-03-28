import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bingo Checker",
  description: "ビンゴカードの数字登録と抽選進行を1画面で管理できるサイト",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
