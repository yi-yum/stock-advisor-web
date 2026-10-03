'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, Clock } from 'lucide-react'
import { fetchCryptoStrategyChart, fetchCryptoStrategyStatus, fetchCryptoSignalHistory, fetchCryptoTracker } from '@/lib/api'

// ── 幣種設定 ──────────────────────────────────────────
const COINS = [
  { symbol: 'BTCUSDT', label: 'BTC', name: 'Bitcoin',   color: '#F7931A' },
  { symbol: 'ETHUSDT', label: 'ETH', name: 'Ethereum',  color: '#627EEA' },
  { symbol: 'SOLUSDT', label: 'SOL', name: 'Solana',    color: '#9945FF' },
  { symbol: 'BNBUSDT', label: 'BNB', name: 'BNB',       color: '#F3BA2F' },
  { symbol: 'XRPUSDT', label: 'XRP', name: 'XRP',       color: '#00AAE4' },
  { symbol: 'DOGEUSDT',label: 'DOGE',name: 'Dogecoin',  color: '#C2A633' },
  { symbol: 'ADAUSDT', label: 'ADA', name: 'Cardano',   color: '#0033AD' },
  { symbol: 'AVAXUSDT',label: 'AVAX',name: 'Avalanche', color: '#E84142' },
  { symbol: 'LINKUSDT',label: 'LINK',name: 'Chainlink', color: '#2A5ADA' },
]

// ── 工具函式 ──────────────────────────────────────────
function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.floor(hours / 24)} 天前`
}

function holdDuration(ts: string | null | undefined): string | null {
  if (!ts) return null
  const diff = Date.now() - new Date(ts).getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days} 天 ${hours} 小時`
  if (hours > 0) return `${hours} 小時`
  return `${Math.floor(diff / 60000)} 分鐘`
}

// ── 格式化 ────────────────────────────────────────────
const fmtPrice = (v: number | null) => {
  if (v === null || v === undefined) return '—'
  if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1) return v.toFixed(4)
  return v.toFixed(6)
}

// ── 策略 K 線圖 ───────────────────────────────────────
interface ChartCandle {
  time: number; open: number; high: number; low: number; close: number
  squeeze?: boolean; gc?: number; volume?: number
}
interface ChartData {
  symbol: string; strategy: string; interval: string; signal: string
  entry_bars: number[]
  exit_bars: number[]
  candles: ChartCandle[]
  overlays: Record<string, Array<{ time: number; value: number | null }>>
}

const OVERLAY_COLORS = ['#60a5fa', '#f97316', '#6b7280']

function StrategyChart({ symbol, strategy }: { symbol: string; strategy: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)

  useEffect(() => {
    setLoading(true); setErr(false)
    fetchCryptoStrategyChart(symbol, 120)
      .then(d => { setChartData(d); setLoading(false) })
      .catch(() => { setLoading(false); setErr(true) })
  }, [symbol])

  useEffect(() => {
    if (!containerRef.current || !chartData || chartData.candles.length === 0) return
    let chart: any = null
    let resizeObserver: ResizeObserver | null = null
    let mounted = true

    import('lightweight-charts').then((lw: any) => {
      if (!mounted || !containerRef.current) return

      chart = lw.createChart(containerRef.current, {
        layout: { background: { color: '#0f172a' }, textColor: '#9ca3af' },
        grid:   { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#374151' },
        rightPriceScale: { borderColor: '#374151' },
        crosshair: {
          vertLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
          horzLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
        },
        width: containerRef.current.clientWidth,
        height: 300,
      })

      const candleSeries = chart.addSeries(lw.CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      })

      const GC_COLORS: Record<number, { up: string; down: string; wick: string }> = {
        3: { up: '#16a34a', down: '#15803d', wick: '#22c55e' },
        2: { up: '#ca8a04', down: '#92400e', wick: '#eab308' },
        1: { up: '#c2410c', down: '#9a3412', wick: '#f97316' },
        0: { up: '#ef4444', down: '#dc2626', wick: '#f87171' },
      }

      const candleData = chartData.candles.map(c => {
        const isUp = c.close >= c.open
        if (c.squeeze) return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          color: isUp ? '#d97706' : '#92400e', borderColor: '#f59e0b', wickColor: '#f59e0b',
        }
        if (c.gc !== undefined) {
          const col = GC_COLORS[c.gc] ?? GC_COLORS[0]!
          return {
            time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
            color: isUp ? col.up : col.down, borderColor: col.wick, wickColor: col.wick,
          }
        }
        return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }
      })
      candleSeries.setData(candleData)

      // ── 成交量柱（底部 15%，半透明）──────────────────────────────────────
      if (chartData.candles[0]?.volume != null) {
        const volSeries = chart.addSeries(lw.HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'vol',
        })
        volSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
          borderVisible: false,
        })
        volSeries.applyOptions({ lastValueVisible: false, priceLineVisible: false })
        volSeries.setData(chartData.candles.map(c => ({
          time:  c.time,
          value: c.volume ?? 0,
          color: (c.close >= c.open) ? '#22c55e44' : '#ef444444',
        })))
      }

      if (strategy === 'EMA') {
        Object.entries(chartData.overlays).forEach(([key, pts], idx) => {
          const series = chart.addSeries(lw.LineSeries, {
            color: OVERLAY_COLORS[idx] ?? '#9ca3af',
            lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
            crosshairMarkerVisible: false, title: key,
          })
          series.setData(pts.filter(p => p.value !== null).map(p => ({ time: p.time, value: p.value! })))
        })
      } else if (strategy === 'DC') {
        const defs = [
          { key: 'dc_high',     color: '#f59e0b', title: '進場高點' },
          { key: 'dc_low',      color: '#f59e0b', title: '進場低點' },
          { key: 'dc_low_exit', color: '#ef4444', title: '出場低點' },
        ]
        defs.forEach(({ key, color, title }) => {
          const pts = chartData.overlays[key]
          if (!pts) return
          const series = chart.addSeries(lw.LineSeries, {
            color, lineWidth: 1, lineStyle: 1,
            priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false, title,
          })
          series.setData(pts.filter(p => p.value !== null).map(p => ({ time: p.time, value: p.value! })))
        })
      }

      if (lw.createSeriesMarkers) {
        const markers: any[] = []
        for (const t of (chartData.entry_bars ?? [])) {
          markers.push({ time: t, position: 'belowBar', color: '#22c55e', shape: 'arrowUp',   text: '進場' })
        }
        for (const t of (chartData.exit_bars ?? [])) {
          markers.push({ time: t, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: '出場' })
        }
        markers.sort((a, b) => a.time - b.time)
        if (markers.length > 0) lw.createSeriesMarkers(candleSeries, markers)
      }

      chart.timeScale().fitContent()

      resizeObserver = new ResizeObserver(entries => {
        if (chart && entries[0]) chart.applyOptions({ width: entries[0].contentRect.width })
      })
      if (containerRef.current) resizeObserver.observe(containerRef.current)
    })

    return () => { mounted = false; resizeObserver?.disconnect(); chart?.remove() }
  }, [chartData, strategy])

  if (loading) return (
    <div className="h-[300px] flex items-center justify-center text-gray-500 text-xs animate-pulse">
      載入 K 線圖中...
    </div>
  )
  if (err || !chartData) return (
    <div className="h-[100px] flex items-center justify-center text-gray-600 text-xs">無法載入圖表</div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs text-gray-600">
        <span>{chartData.interval.toUpperCase()} · 最近 120 根</span>
        <div className="flex items-center gap-3">
          {strategy === 'VB' && (
            <span><span className="inline-block w-2 h-2 rounded-sm bg-yellow-500 mr-1" />琥珀色 = ATR 收縮中</span>
          )}
          {strategy === '3ST' && (
            <span className="flex gap-1.5">
              <span className="text-green-500">■ 3條</span>
              <span className="text-yellow-500">■ 2條</span>
              <span className="text-orange-500">■ 1條</span>
              <span className="text-red-500">■ 0條</span>
              <span>多頭</span>
            </span>
          )}
          {(chartData.entry_bars?.length > 0) && (
            <span className="text-green-500">▲ = 進場</span>
          )}
          {(chartData.exit_bars?.length > 0) && (
            <span className="text-red-500">▼ = 出場</span>
          )}
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  )
}


// ── 策略指標型別 ──────────────────────────────────────
interface StrategyStatus {
  symbol: string
  strategy: string
  signal: 'LONG' | 'SHORT' | 'HOLD' | 'WAIT' | 'EXIT'
  can_enter: boolean
  reason: string
  price: number | null
  macro_bull: boolean | null
  // VB
  sq_count?: number
  sq_bars_needed?: number
  sq_high?: number | null
  sq_low?: number | null
  atr_ratio?: number | null
  sl?: number | null
  tp?: number | null
  // 3ST
  green_count?: number
  st_dirs?: number[]
  st_labels?: string[]
  // EMA
  fast_above_slow?: boolean
  above_trend?: boolean
  golden_cross?: boolean
  bars_since_cross?: number
  pct_gap?: number
  fast_period?: number
  slow_period?: number
  trend_period?: number
  // DC
  dc_high?: number
  pct_to_high?: number
  entry_period?: number
}

const STRAT_COLOR: Record<string, string> = {
  VB:   'text-blue-400 bg-blue-900/30',
  '3ST':'text-purple-400 bg-purple-900/30',
  EMA:  'text-emerald-400 bg-emerald-900/30',
  DC:   'text-amber-400 bg-amber-900/30',
}

// ── 訊號歷史面板 ──────────────────────────────────────
interface SignalHistoryEntry {
  symbol: string; signal: string; strategy: string
  price: number | null; reason: string; timestamp: string
}

function SignalHistoryPanel({ history, lastChecked }: {
  history: SignalHistoryEntry[]
  lastChecked: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  if (history.length === 0 && !lastChecked) return null

  const recent = [...history].reverse().slice(0, 50)

  const sigStyle = (sig: string) => {
    if (sig === 'LONG')  return 'text-green-400'
    if (sig === 'SHORT') return 'text-purple-400'
    if (sig === 'EXIT')  return 'text-red-400'
    return 'text-gray-400'
  }
  const sigEmoji = (sig: string) => sig === 'LONG' ? '🟢' : sig === 'SHORT' ? '🔵' : sig === 'EXIT' ? '🔴' : '⚪'

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 text-sm text-gray-300 transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">訊號歷史記錄</span>
          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{history.length} 筆</span>
          {lastChecked && (
            <span className="text-xs text-gray-600">· 上次檢查 {timeAgo(lastChecked)}</span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{expanded ? '▲ 收起' : '▼ 展開'}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-800">
          {recent.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-600 text-sm">尚無歷史記錄</div>
          ) : recent.map((entry, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/50">
              <div className="flex items-center gap-2.5">
                <span className="text-base">{sigEmoji(entry.signal)}</span>
                <div>
                  <span className="font-semibold text-white text-sm">{entry.symbol.replace('USDT','')}</span>
                  <span className={`ml-1.5 text-xs font-bold ${sigStyle(entry.signal)}`}>{entry.signal}</span>
                  <span className="ml-1.5 text-xs text-gray-500">{entry.strategy}</span>
                </div>
              </div>
              <div className="text-right">
                {entry.price && (
                  <div className="text-white text-sm tabular-nums">${entry.price.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                )}
                <div className="text-gray-600 text-xs">{timeAgo(entry.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 持倉追蹤面板 ──────────────────────────────────────
interface CryptoAddOn { level: number; label: string; price: number; weight_pct: number; new_stop: number; new_stop_label: string }
interface CryptoOpenPos {
  symbol: string; strategy: string; side: 'LONG' | 'SHORT'
  entry_time: string; entry_price: number; entry_reason: string
  sl: number | null; tp: number | null; add_on_levels: CryptoAddOn[]
  current_price: number; current_pnl_pct: number
}
interface CryptoClosedPos {
  symbol: string; strategy: string; side: string
  entry_time: string; entry_price: number; exit_time: string; exit_price: number
  pnl_pct: number; exit_reason: string; holding_hours: number
}
interface CryptoStats { trades: number; win_rate: number | null; avg_pnl: number | null; total_pnl: number | null; avg_hours: number | null }
interface CryptoTrackerData {
  open: CryptoOpenPos[]
  closed: CryptoClosedPos[]
  summary: {
    overall: CryptoStats
    by_strategy: Record<string, CryptoStats>
    by_symbol: Record<string, CryptoStats>
    open_count: number
    open_unrealized_avg: number | null
  }
}

const pnlCls = (v: number | null | undefined) =>
  v == null ? 'text-gray-400' : v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400'
const pnlTxt = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`

function CryptoTrackerPanel() {
  const [data, setData] = useState<CryptoTrackerData | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    const load = () => fetchCryptoTracker(100).then(setData).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  if (!data) return null
  const { open, closed, summary } = data
  const ov = summary.overall
  const strategies = Object.entries(summary.by_strategy)

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-gray-200">📊 持倉追蹤（實際運行紀錄）</span>
        <span className="text-xs text-gray-500">每小時檢查；損益已扣往返手續費 0.1%；僅記錄後端運行期間的新訊號</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">持倉中</div>
            <div className="text-lg font-bold text-white">{summary.open_count}</div>
            <div className={`text-xs ${pnlCls(summary.open_unrealized_avg)}`}>未實現均 {pnlTxt(summary.open_unrealized_avg)}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">已平倉</div>
            <div className="text-lg font-bold text-white">{ov.trades}</div>
            <div className="text-xs text-gray-500">均持有 {ov.avg_hours ?? '—'}h</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">勝率</div>
            <div className="text-lg font-bold text-white">{ov.win_rate != null ? `${ov.win_rate}%` : '—'}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">平均損益</div>
            <div className={`text-lg font-bold ${pnlCls(ov.avg_pnl)}`}>{pnlTxt(ov.avg_pnl)}</div>
            <div className={`text-xs ${pnlCls(ov.total_pnl)}`}>累計 {pnlTxt(ov.total_pnl)}</div>
          </div>
        </div>

        {open.length === 0 ? (
          <div className="text-center text-gray-600 text-sm py-3">目前沒有追蹤中的持倉（出現新進場訊號時會自動開倉記錄）</div>
        ) : (
          <div className="space-y-2">
            {open.map(p => (
              <div key={p.symbol} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white">{p.symbol.replace('USDT', '')}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STRAT_COLOR[p.strategy] ?? 'text-gray-400 bg-gray-700'}`}>{p.strategy}</span>
                  <span className={`text-xs font-bold ${p.side === 'LONG' ? 'text-green-400' : 'text-purple-400'}`}>{p.side}</span>
                  <span className={`ml-auto font-bold ${pnlCls(p.current_pnl_pct)}`}>{pnlTxt(p.current_pnl_pct)}</span>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400 mt-1">
                  <span>進場 <span className="text-white">${fmtPrice(p.entry_price)}</span></span>
                  <span>現價 <span className="text-white">${fmtPrice(p.current_price)}</span></span>
                  <span>止損 <span className="text-red-400">{p.sl != null ? `$${fmtPrice(p.sl)}` : '—'}</span></span>
                  {p.tp != null && <span>止盈 <span className="text-green-400">${fmtPrice(p.tp)}</span></span>}
                  <span>{holdDuration(p.entry_time) ?? ''}</span>
                </div>
                {p.add_on_levels.length > 0 && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-500">加碼計畫：</span>
                    {p.add_on_levels.map(lv => {
                      const reached = p.current_price >= lv.price
                      return (
                        <span
                          key={lv.level}
                          title={`${lv.new_stop_label}：${lv.new_stop}`}
                          className={`text-xs px-2 py-0.5 rounded border ${reached ? 'bg-amber-900/50 text-amber-300 border-amber-700' : 'bg-gray-700/50 text-gray-500 border-gray-700'}`}
                        >
                          {reached ? '✅ ' : ''}{lv.label} ${fmtPrice(lv.price)}（{lv.weight_pct}%）
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {strategies.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">分策略績效</div>
            <div className="flex flex-wrap gap-2">
              {strategies.map(([name, st]) => (
                <div key={name} className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                  <span className={`font-medium px-1.5 py-0.5 rounded ${STRAT_COLOR[name] ?? 'text-gray-400 bg-gray-700'}`}>{name}</span>
                  <span className="ml-2 text-gray-400">{st.trades} 筆 · 勝率 {st.win_rate}% · 均 </span>
                  <span className={pnlCls(st.avg_pnl)}>{pnlTxt(st.avg_pnl)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {closed.length > 0 && (
          <div>
            <button onClick={() => setShowClosed(v => !v)} className="text-xs text-gray-400 hover:text-white">
              {showClosed ? '▲ 收起' : '▼ 展開'} 已平倉紀錄（{closed.length}）
            </button>
            {showClosed && (
              <div className="mt-2 divide-y divide-gray-800 border border-gray-800 rounded-lg">
                {closed.map((c, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-white">{c.symbol.replace('USDT', '')}</span>
                      <span className="ml-1.5 text-gray-500">{c.strategy} {c.side}</span>
                      <span className="ml-2 text-gray-600">{c.exit_reason} · {c.holding_hours}h</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 mr-2">${fmtPrice(c.entry_price)} → ${fmtPrice(c.exit_price)}</span>
                      <span className={`font-bold ${pnlCls(c.pnl_pct)}`}>{pnlTxt(c.pnl_pct)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StrategyCard({ s, coin, holdSince }: { s: StrategyStatus; coin: typeof COINS[0] | undefined; holdSince?: string | null }) {
  const isEntry = s.signal === 'LONG'
  const isShort = s.signal === 'SHORT'
  const isHold  = s.signal === 'HOLD'
  const isExit  = s.signal === 'EXIT'
  const [showChart, setShowChart] = useState(isEntry || isExit || isShort)

  // 當訊號變為 LONG、EXIT 或 SHORT 時自動展開
  useEffect(() => {
    if (isEntry || isExit || isShort) setShowChart(true)
  }, [isEntry, isExit, isShort])

  const cardBorder = isEntry ? 'border-green-500/70' : isShort ? 'border-purple-500/70' : isHold ? 'border-blue-500/40' : isExit ? 'border-red-500/70' : 'border-gray-700'
  const cardBg     = isEntry ? 'bg-green-900/15'     : isShort ? 'bg-purple-900/15'     : isHold ? 'bg-blue-900/10'     : isExit ? 'bg-red-900/15'    : 'bg-gray-800'
  const sigLabel   = isEntry ? '🟢 進場訊號'          : isShort ? '🔵 做空訊號'           : isHold ? '趨勢延續中'          : isExit ? '🔴 出場訊號'      : '等待中'
  const sigColor   = isEntry ? 'bg-green-900 text-green-300' : isShort ? 'bg-purple-900 text-purple-300' : isHold ? 'bg-blue-900/60 text-blue-300' : isExit ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-400'

  return (
    <div className={`rounded-xl border-2 p-4 ${cardBorder} ${cardBg}`}>
      {/* 頂列 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-black text-lg" style={{ color: coin?.color ?? '#9ca3af' }}>
            {coin?.label ?? s.symbol.replace('USDT', '')}
          </span>
          <span className="text-gray-500 text-xs ml-1.5">{coin?.name}</span>
          <div className="mt-0.5">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${STRAT_COLOR[s.strategy] ?? 'text-gray-400 bg-gray-700'}`}>
              {s.strategy}
            </span>
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${sigColor}`}>{sigLabel}</span>
      </div>

      {/* 現價 */}
      <div className="text-white text-xl font-semibold tabular-nums mb-3">
        {s.price ? `$${fmtPrice(s.price)}` : '—'}
      </div>

      {/* VB */}
      {s.strategy === 'VB' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${(s.sq_count ?? 0) >= (s.sq_bars_needed ?? 20) ? 'bg-green-500' : 'bg-yellow-500'}`}
                style={{ width: `${Math.min(((s.sq_count ?? 0) / (s.sq_bars_needed ?? 20)) * 100, 100)}%` }}
              />
            </div>
            <span className={`text-xs tabular-nums ${(s.sq_count ?? 0) >= (s.sq_bars_needed ?? 20) ? 'text-green-400' : 'text-gray-400'}`}>
              {s.sq_count ?? 0}/{s.sq_bars_needed ?? 20} 根
            </span>
          </div>
          {s.sq_high && s.sq_low && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>收縮區間</span>
              <span className="tabular-nums">${fmtPrice(s.sq_low)} ~ ${fmtPrice(s.sq_high)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">ATR 比率</span>
            <span className={`tabular-nums ${(s.atr_ratio ?? 1) < 0.75 ? 'text-green-400' : 'text-gray-400'}`}>
              {s.atr_ratio?.toFixed(3) ?? '—'}
            </span>
          </div>
          {isEntry && s.sl && s.tp && (
            <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs">
              <div className="bg-gray-900/60 rounded p-1"><div className="text-gray-500">進場</div><div className="text-white">${fmtPrice(s.price)}</div></div>
              <div className="bg-red-900/30 rounded p-1"><div className="text-gray-500">SL</div><div className="text-red-400">${fmtPrice(s.sl)}</div></div>
              <div className="bg-green-900/30 rounded p-1"><div className="text-gray-500">TP</div><div className="text-green-400">${fmtPrice(s.tp)}</div></div>
            </div>
          )}
        </div>
      )}

      {/* 3ST */}
      {s.strategy === '3ST' && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {(s.st_dirs ?? []).map((d, i) => (
              <div key={i} className={`flex-1 rounded py-1.5 text-center text-xs font-bold ${d === 1 ? 'bg-green-900/60 text-green-300' : 'bg-red-900/40 text-red-400'}`}>
                {s.st_labels?.[i]?.replace('ST(', '').replace(')', '') ?? `ST${i+1}`}
                <div className="text-lg leading-none mt-0.5">{d === 1 ? '↑' : '↓'}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>多頭條數</span>
            <span className={`font-bold ${(s.green_count ?? 0) === 3 ? 'text-green-400' : (s.green_count ?? 0) >= 2 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {s.green_count ?? 0} / 3
            </span>
          </div>
        </div>
      )}

      {/* EMA */}
      {s.strategy === 'EMA' && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <div className={`flex-1 rounded py-1.5 px-2 text-xs ${s.fast_above_slow ? 'bg-green-900/40 text-green-300' : 'bg-red-900/30 text-red-400'}`}>
              <div className="text-gray-500 text-xs mb-0.5">EMA{s.fast_period}/{s.slow_period}</div>
              <div className="font-semibold">{s.fast_above_slow ? '快↑慢' : '快↓慢'}</div>
            </div>
            <div className={`flex-1 rounded py-1.5 px-2 text-xs ${s.above_trend ? 'bg-green-900/40 text-green-300' : 'bg-red-900/30 text-red-400'}`}>
              <div className="text-gray-500 text-xs mb-0.5">EMA{s.trend_period}</div>
              <div className="font-semibold">{s.above_trend ? '價格↑' : '價格↓'}</div>
            </div>
          </div>
          {s.golden_cross && (
            <div className="text-xs text-yellow-400 font-semibold text-center bg-yellow-900/20 rounded py-1">
              ✦ 黃金交叉（本根觸發）
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-400">
            <span>EMA 間距</span>
            <span className={`tabular-nums ${(s.pct_gap ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {s.pct_gap !== undefined ? `${s.pct_gap > 0 ? '+' : ''}${s.pct_gap.toFixed(2)}%` : '—'}
            </span>
          </div>
          {!s.golden_cross && s.bars_since_cross !== undefined && (
            <div className="text-xs text-gray-500">上次交叉：{s.bars_since_cross} 根前</div>
          )}
        </div>
      )}

      {/* DC */}
      {s.strategy === 'DC' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, 100 - (s.pct_to_high ?? 100) * 5))}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums">
              距高點 {s.pct_to_high?.toFixed(2) ?? '—'}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{s.entry_period} 根高點</span>
            <span className="text-amber-300 tabular-nums">${fmtPrice(s.dc_high ?? null)}</span>
          </div>
          {isEntry && (
            <div className="text-xs text-green-400 font-semibold text-center bg-green-900/20 rounded py-1">
              ✦ 突破 {s.entry_period} 根高點
            </div>
          )}
        </div>
      )}

      {/* HOLD 停損參考 */}
      {isHold && (
        <div className="mt-2 p-2 bg-blue-950/40 rounded-lg border border-blue-800/30 text-xs space-y-1">
          <div className="text-blue-400 font-semibold">
            持倉中{holdSince ? ` · ${holdDuration(holdSince)}` : ''}
          </div>
          {s.strategy === 'VB' && s.sq_low && (
            <div className="flex justify-between text-gray-400">
              <span>收縮低點（停損參考）</span>
              <span className="text-red-400 tabular-nums">${fmtPrice(s.sq_low)}</span>
            </div>
          )}
          {s.strategy === '3ST' && (
            <div className="text-gray-500">
              三條 ST 全多頭維持即持倉，任一翻空考慮減倉
            </div>
          )}
          {s.strategy === 'EMA' && (
            <div className="text-gray-500">
              快線維持在慢線上方即持倉，死亡交叉出場
            </div>
          )}
        </div>
      )}

      {/* 趨勢過濾 */}
      {s.macro_bull !== null && (
        <div className={`mt-2 text-xs ${s.macro_bull ? 'text-green-500/70' : 'text-red-500/70'}`}>
          日線 EMA200：{s.macro_bull ? '✓ 多頭區間' : '✗ 空頭區間（不進場）'}
        </div>
      )}

      {/* 原因 */}
      <div className="mt-2 text-xs text-gray-500 leading-relaxed">{s.reason}</div>

      {/* K 線圖展開 */}
      <button
        onClick={() => setShowChart(v => !v)}
        className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition border-t border-gray-700 pt-2"
      >
        {showChart ? '▲ 收折圖表' : '▼ 展開 K 線圖'}
      </button>
      {showChart && (
        <div className="mt-2">
          <StrategyChart symbol={s.symbol} strategy={s.strategy} />
        </div>
      )}
    </div>
  )
}


// ── Per-coin 策略訊號面板 ─────────────────────────────
const REFRESH_INTERVAL = 60 * 60  // 1 小時（秒）

function PerCoinSignalsPanel() {
  const [signals, setSignals] = useState<StrategyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [historyData, setHistoryData] = useState<{ history: SignalHistoryEntry[]; last_checked: string | null }>({ history: [], last_checked: null })

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    try {
      const [data, hist] = await Promise.all([
        fetchCryptoStrategyStatus(),
        fetchCryptoSignalHistory().catch(() => ({ history: [], last_checked: null })),
      ])
      setSignals(data.signals ?? [])
      setUpdatedAt(data.updated_at ?? null)
      setHistoryData({ history: hist.history ?? [], last_checked: hist.last_checked ?? null })
      setCountdown(REFRESH_INTERVAL)
    } catch {
      // keep stale data
    } finally {
      setLoading(false)
    }
  }, [])

  // 初次載入
  useEffect(() => { fetchSignals() }, [fetchSignals])

  // 1 小時自動刷新 + 倒數計時
  useEffect(() => {
    const refreshTimer = setInterval(() => { fetchSignals() }, REFRESH_INTERVAL * 1000)
    const countdownTimer = setInterval(() => {
      setCountdown(c => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => { clearInterval(refreshTimer); clearInterval(countdownTimer) }
  }, [fetchSignals])

  const entryCount = signals.filter(s => s.signal === 'LONG').length
  const holdCount  = signals.filter(s => s.signal === 'HOLD').length
  const exitCount  = signals.filter(s => s.signal === 'EXIT').length
  const shortCount = signals.filter(s => s.signal === 'SHORT').length

  const holdSinceMap = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const s of signals) {
      if (s.signal !== 'HOLD') continue
      const entries = historyData.history.filter(h => h.symbol === s.symbol && h.signal === 'LONG')
      map[s.symbol] = entries.length > 0 ? entries[entries.length - 1]!.timestamp : null
    }
    return map
  }, [signals, historyData.history])

  const fmtCountdown = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div className="space-y-3">
      {/* 狀態摘要列 */}
      <div className="flex flex-wrap items-center gap-2">
        {entryCount > 0 && (
          <span className="px-2.5 py-1 bg-green-900/50 text-green-300 rounded-full text-xs font-bold border border-green-700/50">
            🟢 {entryCount} 進場
          </span>
        )}
        {shortCount > 0 && (
          <span className="px-2.5 py-1 bg-purple-900/50 text-purple-300 rounded-full text-xs font-bold border border-purple-700/50">
            🔵 {shortCount} 做空
          </span>
        )}
        {holdCount > 0 && (
          <span className="px-2.5 py-1 bg-blue-900/40 text-blue-300 rounded-full text-xs font-semibold border border-blue-700/40">
            ● {holdCount} 持倉
          </span>
        )}
        {exitCount > 0 && (
          <span className="px-2.5 py-1 bg-red-900/50 text-red-300 rounded-full text-xs font-bold border border-red-700/50">
            🔴 {exitCount} 出場
          </span>
        )}
        {entryCount === 0 && exitCount === 0 && shortCount === 0 && (
          <span className="text-gray-600 text-xs">目前無進出場訊號</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600 space-y-0.5">
          <p>各幣種最佳化策略即時訊號 · 每 1 小時自動刷新</p>
          <p>🟢 進場 = 條件剛觸發 · <span className="text-blue-500/70">持倉</span> = 訊號維持中 · 🔴 出場 = 考慮平倉 · <span className="text-gray-500">等待</span> = 條件未達</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-gray-600">
            <Clock className="w-3 h-3" />
            {fmtCountdown(countdown)}
          </span>
          <button
            onClick={fetchSignals}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
            {updatedAt && <span className="text-gray-600 ml-1">{new Date(updatedAt).toLocaleTimeString('zh-TW')}</span>}
          </button>
        </div>
      </div>

      {loading && signals.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-10 text-center text-gray-500 text-sm animate-pulse">
          載入策略訊號中...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {signals.map(s => (
            <StrategyCard key={s.symbol} s={s} coin={COINS.find(c => c.symbol === s.symbol)} holdSince={holdSinceMap[s.symbol]} />
          ))}
        </div>
      )}

      <CryptoTrackerPanel />

      <SignalHistoryPanel history={historyData.history} lastChecked={historyData.last_checked} />
    </div>
  )
}


// ── 主頁面 ────────────────────────────────────────────
export default function CryptoPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">🪙 加密貨幣訊號</h1>
        <p className="text-gray-400 text-sm mt-1">
          各幣種最佳化策略 · VB / 三重 ST / EMA Cross / Donchian
        </p>
      </div>
      <PerCoinSignalsPanel />
    </div>
  )
}
