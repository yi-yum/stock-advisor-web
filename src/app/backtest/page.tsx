'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { Search, TrendingUp, BarChart3 } from 'lucide-react'
import { runBacktestStock } from '@/lib/api'

interface Trade {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  strategy: string
  exit_reason: string
  return_pct: number
  days_held: number
}

interface StrategyStats {
  trades: number
  win_rate: number
  avg_return: number
}

interface BacktestResult {
  symbol: string
  start_date: string
  end_date: string
  strategy: string
  total_return: number
  buy_hold_return: number
  total_trades: number
  win_rate: number
  avg_return: number
  max_drawdown: number
  by_strategy: Record<string, StrategyStats>
  equity_curve: { date: string; value: number }[]
  buy_hold_curve: { date: string; value: number }[]
  trades: Trade[]
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function BacktestPage() {
  const today = new Date().toISOString().slice(0, 10)
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10)

  const [symbol, setSymbol] = useState('')
  const [market, setMarket] = useState('us')
  const [startDate, setStartDate] = useState(twoYearsAgo)
  const [endDate, setEndDate] = useState(today)
  const [strategy, setStrategy] = useState('supertrend')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [showTrades, setShowTrades] = useState(false)

  const strategyLabels: Record<string, string> = {
    supertrend:           '三重 SuperTrend · 三條全綠進場，三條全紅出場',
    structural_pullback:  '結構性回調 · 均線多頭排列 → 回踩縮量 → 轉強訊號進場',
  }

  const suffixMap: Record<string, string> = { us: '', tw: '.TW', two: '.TWO' }
  const resolvedSymbol = () => {
    const s = symbol.trim().toUpperCase()
    // already has suffix → use as-is
    if (/\.(TW|TWO)$/i.test(s)) return s
    return s + suffixMap[market]
  }

  const handleRun = async () => {
    if (!symbol.trim()) { setError('請輸入股票代號'); return }
    if (!startDate || !endDate) { setError('請填寫起訖日期'); return }
    if (startDate >= endDate) { setError('起始日必須早於結束日'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await runBacktestStock({
        symbol: resolvedSymbol(), startDate, endDate, strategy,
      })
      setResult(data)
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || '回測失敗')
    } finally {
      setLoading(false)
    }
  }

  // 進出場日期集合
  const entryDates     = new Set(result?.trades.map(t => t.entry_date) ?? [])
  const profitExitDates = new Set(result?.trades.filter(t => t.return_pct >= 0).map(t => t.exit_date) ?? [])
  const lossExitDates   = new Set(result?.trades.filter(t => t.return_pct < 0).map(t => t.exit_date) ?? [])

  // 合併策略曲線與 B&H 曲線，進出場日一定保留
  const chartData = (() => {
    if (!result) return []
    const bhMap      = new Map((result.buy_hold_curve ?? []).map(p => [p.date, p.value]))
    const tradeDates = new Set([
      ...result.trades.map(t => t.entry_date),
      ...result.trades.map(t => t.exit_date),
    ])
    return result.equity_curve
      .filter((p, i, arr) =>
        i % 5 === 0 || i === arr.length - 1 || tradeDates.has(p.date)
      )
      .map(p => ({
        date: p.date,
        策略: p.value,
        買入持有: bhMap.get(p.date) ?? null,
      }))
  })()
  const initVal = result?.equity_curve[0]?.value ?? 100000

  // 台股 / 美股 幣別偵測
  const isTW  = (sym: string) => /\.(TW|TWO)$/i.test(sym)
  const cur   = result && isTW(result.symbol) ? 'NT$' : '$'
  const fmtV  = (v: number) => `${cur}${v.toLocaleString()}`
  const fmtVk = (v: number) => `${cur}${(v / 1000).toFixed(0)}k`

  // 自訂 dot：進場 ▲ 綠，獲利出場 ▽ 琥珀，虧損出場 ▽ 紅
  const renderDot = (props: any) => {
    const { cx, cy, payload } = props
    const d = payload?.date as string
    if (!d || cx == null || cy == null) return <g key={`dot-null-${Math.random()}`} />
    if (entryDates.has(d))
      return <polygon key={`e-${d}`} points={`${cx},${cy-9} ${cx-6},${cy+3} ${cx+6},${cy+3}`} fill="#22c55e" opacity={0.9} />
    if (profitExitDates.has(d))
      return <polygon key={`xp-${d}`} points={`${cx},${cy+9} ${cx-6},${cy-3} ${cx+6},${cy-3}`} fill="#f59e0b" opacity={0.9} />
    if (lossExitDates.has(d))
      return <polygon key={`xl-${d}`} points={`${cx},${cy+9} ${cx-6},${cy-3} ${cx+6},${cy-3}`} fill="#ef4444" opacity={0.9} />
    return <g key={`dot-${d}`} />
  }

  // 自訂 Tooltip：滑到進出場點時顯示交易細節
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const equity = payload.find((p: any) => p.dataKey === '策略')?.value as number | undefined
    const bh     = payload.find((p: any) => p.dataKey === '買入持有')?.value as number | undefined
    const entries = result?.trades.filter(t => t.entry_date === label) ?? []
    const exits   = result?.trades.filter(t => t.exit_date   === label) ?? []
    return (
      <div className="bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-xs min-w-[160px]">
        <div className="text-gray-400 mb-1.5">{label}</div>
        {equity != null && <div className="text-blue-400">策略：{fmtV(equity)}</div>}
        {bh     != null && <div className="text-gray-500">買入持有：{fmtV(bh)}</div>}
        {entries.map((t, i) => (
          <div key={i} className="text-green-400 mt-1">▲ 進場 @ {t.entry_price}</div>
        ))}
        {exits.map((t, i) => (
          <div key={i} className={`mt-1 ${t.return_pct >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            ▼ 出場 @ {t.exit_price}　{t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-blue-400" />
          策略回測
        </h1>
        <p className="text-gray-400 text-sm mt-1">{strategyLabels[strategy]}</p>
      </div>

      {/* 輸入區 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex gap-3 flex-wrap">
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="us">美股</option>
            <option value="tw">台股上市 (.TW)</option>
            <option value="two">台股上櫃 (.TWO)</option>
          </select>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            placeholder={market === 'us' ? 'AAPL' : market === 'tw' ? '2330' : '6547'}
            className="flex-1 min-w-32 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={strategy}
            onChange={e => { setStrategy(e.target.value); setResult(null) }}
            className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="supertrend">三重 SuperTrend</option>
            <option value="structural_pullback">結構性回調</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
            <span className="text-gray-500 text-sm">至</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
          >
            <Search className="w-4 h-4" />
            {loading ? '回測中...' : '執行回測'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <p className="text-gray-600 text-xs mt-2">⚠ 回測結果僅供參考，不代表未來表現</p>
      </div>

      {loading && (
        <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">回測中，約需 10-20 秒...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5">
          {/* 回測資訊列 */}
          <div className="text-xs text-gray-500">
            {result.symbol} · {result.start_date} ~ {result.end_date} · {strategyLabels[result.strategy] ?? result.strategy}
          </div>
          {/* 核心指標 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="策略總報酬"
              value={`${result.total_return >= 0 ? '+' : ''}${result.total_return.toFixed(1)}%`}
              sub={result.total_return >= result.buy_hold_return ? '✓ 勝過買入持有' : '✗ 未勝買入持有'}
              color={result.total_return >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="買入持有報酬"
              value={`${result.buy_hold_return >= 0 ? '+' : ''}${result.buy_hold_return.toFixed(1)}%`}
              sub="基準比較"
              color={result.buy_hold_return >= 0 ? 'text-gray-300' : 'text-red-400'}
            />
            <StatCard
              label="勝率"
              value={`${(result.win_rate * 100).toFixed(1)}%`}
              sub={`共 ${result.total_trades} 筆交易`}
              color={result.win_rate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}
            />
            <StatCard
              label="平均每筆報酬"
              value={`${result.avg_return >= 0 ? '+' : ''}${result.avg_return.toFixed(2)}%`}
              color={result.avg_return >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="最大回撤"
              value={`${result.max_drawdown.toFixed(1)}%`}
              color="text-red-400"
            />
          </div>

          {/* 策略分類統計 */}
          {Object.keys(result.by_strategy).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(result.by_strategy).map(([name, stat]) => (
                <div key={name} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="font-semibold text-gray-200">{name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="text-gray-400 text-xs">交易數</div>
                      <div className="font-bold text-white">{stat.trades}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">勝率</div>
                      <div className={`font-bold ${stat.win_rate >= 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {(stat.win_rate * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">均報酬</div>
                      <div className={`font-bold ${stat.avg_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stat.avg_return >= 0 ? '+' : ''}{stat.avg_return.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 資金曲線 */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-200">資金曲線</h3>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,0 0,12 12,12" fill="#22c55e"/></svg>
                  進場
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,12 0,0 12,0" fill="#f59e0b"/></svg>
                  出場（獲利）
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,12 0,0 12,0" fill="#ef4444"/></svg>
                  出場（虧損）
                </span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={d => d.slice(0, 7)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={fmtVk} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <ReferenceLine y={initVal} stroke="#4B5563" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="策略" stroke="#3B82F6" dot={renderDot} activeDot={{ r: 4, fill: '#3B82F6' }} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="買入持有" stroke="#9CA3AF" dot={false} strokeWidth={1.5} strokeDasharray="5 5" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 交易明細 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <button
              onClick={() => setShowTrades(v => !v)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/50 transition"
            >
              <span className="font-semibold text-gray-200">交易明細（{result.trades.length} 筆）</span>
              <span className="text-gray-400 text-sm">{showTrades ? '收起 ▲' : '展開 ▼'}</span>
            </button>
            {showTrades && (
              <div className="overflow-x-auto border-t border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-700/50">
                    <tr>
                      {['買入日', '賣出日', '策略', '買入價', '賣出價', '報酬', '天數', '原因'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{t.entry_date}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{t.exit_date}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-green-900/50 text-green-400">
                            {t.strategy}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300">{cur}{t.entry_price}</td>
                        <td className="px-3 py-2 text-gray-300">{cur}{t.exit_price}</td>
                        <td className={`px-3 py-2 font-semibold ${t.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
                        </td>
                        <td className="px-3 py-2 text-gray-400">{t.days_held}d</td>
                        <td className="px-3 py-2 text-gray-500">{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
