'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, History, Coins, BarChart3, TrendingUp } from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  emoji?: string
}

const navItems: NavItem[] = [
  { label: '每日掃描', href: '/scanner',      icon: Search,    emoji: '📡' },
  { label: '板塊流向', href: '/sector-flow',  icon: TrendingUp, emoji: '💹' },
  { label: '加密貨幣', href: '/crypto',       icon: Coins,     emoji: '🪙' },
  { label: '策略回測', href: '/backtest',     icon: BarChart3, emoji: '📊' },
  { label: '歷史紀錄', href: '/history',      icon: History,   emoji: '📁' },
]

// ── 桌面側邊欄 ────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* 桌面：左側固定側邊欄 */}
      <aside className="hidden md:flex flex-col w-60 bg-gray-800 border-r border-gray-700 overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>📈</span>
            買入時機分析系統
          </h1>
        </div>
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white font-semibold'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {item.emoji && <span>{item.emoji}</span>}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* 手機：底部導覽列 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 flex items-center justify-around px-2 py-1 safe-area-pb">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-0 ${
                isActive ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              <span className="text-xl leading-none">{item.emoji}</span>
              <span className="text-[10px] leading-tight truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
