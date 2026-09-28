import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: '買入時機分析系統',
  description: '股票分析和投資決策系統',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-900 text-white">
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
