'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Clock, AlertCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, X } from 'lucide-react'
import {
  fetchScannerResults, triggerScan, fetchScannerStatus, getScannerChartUrl,
  fetchTrackerOpen, fetchTrackerClosed, fetchTrackerSummary, closeTrackerPosition,
  fetchSymbolHistory, fetchDailySummary, fetchSectorFlowTw, fetchMarketState,
  fetchCryptoStrategyStatus,
} from '@/lib/api'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface SignalHistoryEntry {
  date: string
  signal: 'BUY' | 'WATCH'
}

interface AddOnLevel {
  level: number
  label: string
  price: number
  weight_pct: number
  new_stop: number
  new_stop_label: string
}

interface ScanResult {
  symbol: string
  name: string
  sector: string
  close: number
  change_pct: number
  rsi: number
  volume_ratio: number
  trigger_reasons: string[]
  signal: 'BUY' | 'WATCH' | 'WAIT'
  signal_label: string
  trend_score: number
  entry_score: number
  pullback_valid: boolean
  sl: number | null
  tp: number | null
  rr: number | null
  add_on_levels?: AddOnLevel[]
  claude_analysis: string | null
  signal_history: SignalHistoryEntry[]
  earnings_soon: boolean
  earnings_date: string | null
}

interface ScanData {
  market: string
  scan_time: string
  total_scanned: number
  pre_screened: number
  analyzed: number
  results: ScanResult[]
  message?: string
}

interface ScannerStatus {
  tw: { last_scan_time: string | null; signal_count: number; is_scanning: boolean }
  us: { last_scan_time: string | null; signal_count: number; is_scanning: boolean }
  schedule: { tw: string; us: string }
}

interface TopCandidate {
  market: 'tw' | 'us'
  symbol: string
  name: string
  sector: string
  close: number
  change_pct: number
  signal_label: string
  score: number
  resonance: boolean
  timing: '🟢' | '🟡' | '🔴' | null
  upgraded: boolean
}

interface TopCryptoEntry {
  symbol: string
  strategy: string
  reason: string
  price: number | null
}

interface TrackerPosition {
  symbol: string
  market: string
  sector: string
  entry_date: string
  entry_price: number
  signal: string
  signal_label: string
  strategy: string
  trend_score: number
  entry_score: number
  sl: number | null
  current_sl: number | null
  current_price: number
  current_pnl_pct: number
  last_updated: string
  green_count?: number
  chart_pattern?: string
  entry_zone?: { low?: number; high?: number }
  add_on_levels?: AddOnLevel[]
}

interface ClosedPosition {
  symbol: string
  market: string
  sector: string
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  pnl_pct: number
  exit_reason: string
  holding_days: number
  trend_score: number | null
  entry_score: number | null
  sl: number | null
  tp: number | null
  rr: number | null
}

interface TimingStat {
  count: number
  wins: number
  win_rate: number | null
  avg_pnl: number | null
  total_pnl: number
}

interface SectorStat {
  sector: string
  count: number
  wins: number
  win_rate: number | null
  avg_pnl: number | null
}

interface MonthlyStat {
  month: string
  count: number
  wins: number
  win_rate: number | null
  avg_pnl: number | null
  total_pnl: number
}

interface TrackerSummary {
  total_closed: number
  win_rate: number | null
  avg_pnl_pct: number | null
  total_pnl_pct: number | null
  best_trade: { symbol: string; pnl_pct: number; exit_date: string } | null
  worst_trade: { symbol: string; pnl_pct: number; exit_date: string } | null
  avg_hold_days: number | null
  open_count: number
  open_unrealized_pct: number | null
  timing_stats: Record<string, TimingStat>
  sector_stats: SectorStat[]
  monthly_stats: MonthlyStat[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) }
  catch { return iso }
}

const pnlColor = (v: number) => v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400'
const pnlPrefix = (v: number) => v > 0 ? '+' : ''

const SignalBadge = ({ signal }: { signal: string }) => {
  if (signal === 'BUY') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900 text-green-300">買入</span>
  if (signal === 'WATCH') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900 text-yellow-300">觀察</span>
  return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-300">等待</span>
}

function getEntryTiming(analysis: string | null): '🟢' | '🟡' | '🔴' | null {
  if (!analysis) return null
  let idx = analysis.indexOf('【明日開盤建議】')
  if (idx === -1) idx = analysis.indexOf('【進場時機評估】')
  if (idx === -1) return null
  const section = analysis.slice(idx, idx + 300)
  if (section.includes('🟢')) return '🟢'
  if (section.includes('🟡')) return '🟡'
  if (section.includes('🔴')) return '🔴'
  return null
}

const EntryTimingBadge = ({ timing }: { timing: '🟢' | '🟡' | '🔴' | null }) => {
  if (timing === '🟢') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/70 text-green-300 border border-green-700/50">🟢 立即進場</span>
  if (timing === '🟡') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/70 text-yellow-300 border border-yellow-700/50">🟡 等回踩</span>
  if (timing === '🔴') return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700/70 text-gray-400 border border-gray-600/50">🔴 觀望</span>
  return null
}

/** 判斷是否為 WATCH → BUY 升級（signal_history 最後一筆非今日且為 WATCH） */
function isUpgradedFromWatch(history: SignalHistoryEntry[]): boolean {
  if (!history || history.length < 1) return false
  // history 已按日期排序（舊→新），最後一筆是昨天（今天是 BUY 所以不在 history 裡）
  const prev = history[history.length - 1]
  return prev?.signal === 'WATCH'
}

/** 計算連續觀察天數 */
function watchStreak(history: SignalHistoryEntry[]): number {
  if (!history || history.length === 0) return 0
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.signal === 'WATCH') count++
    else break
  }
  return count
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'scan' | 'tracker' | 'history'>('scan')
  const [market, setMarket] = useState<'tw' | 'us'>('tw')
  const [scanData, setScanData] = useState<ScanData | null>(null)
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'BUY' | 'WATCH' | 'STRATEGY'>('ALL')
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const [showGlossary, setShowGlossary] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Tracker state
  const [trackerMarket, setTrackerMarket] = useState<'all' | 'tw' | 'us'>('all')
  const [openPositions, setOpenPositions] = useState<TrackerPosition[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [trackerSummary, setTrackerSummary] = useState<TrackerSummary | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null)

  // 每日總結
  const [dailySummary, setDailySummary] = useState<{ summary: string; date: string; generated: string } | null>(null)
  const [showSummary, setShowSummary] = useState(true)

  // 歷史訊號查詢
  const [historySymbol, setHistorySymbol] = useState('')
  const [historyMarket, setHistoryMarket] = useState<'tw' | 'us'>('tw')
  const [historyData, setHistoryData] = useState<any | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Sector flow cross-reference (TW only)
  const [flowHotCodes, setFlowHotCodes] = useState<Set<string>>(new Set())

  // 大盤 ST 狀態
  const [marketState, setMarketState] = useState<{
    tw: { green_count: number; close: number; date: string } | null
    us: { green_count: number; close: number; date: string } | null
    month: number
    in_season: boolean
  } | null>(null)

  // 今日綜合候選榜（跨台股/美股/加密貨幣）
  const [topCandidates, setTopCandidates] = useState<TopCandidate[]>([])
  const [topCrypto, setTopCrypto] = useState<TopCryptoEntry[]>([])
  const [topLoading, setTopLoading] = useState(true)

  const loadResults = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [results, statusData] = await Promise.all([
        fetchScannerResults(market),
        fetchScannerStatus().catch(() => null),
      ])
      setScanData(results)
      setStatus(statusData)
      const isScanning = statusData?.[market]?.is_scanning ?? false
      if (isScanning) {
        setScanning(true)
        pollRef.current = setTimeout(() => loadResults(true), 5000)
      } else {
        setScanning(false)
        if (pollRef.current) clearTimeout(pollRef.current)
      }
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.detail || '載入掃描結果失敗')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [market])

  const loadTracker = useCallback(async () => {
    setTrackerLoading(true)
    try {
      const mkt = trackerMarket === 'all' ? undefined : trackerMarket
      const [openData, closedData, summaryData] = await Promise.all([
        fetchTrackerOpen(mkt),
        fetchTrackerClosed(mkt, 50),
        fetchTrackerSummary(),
      ])
      setOpenPositions(openData.positions || [])
      setClosedPositions(closedData.positions || [])
      setTrackerSummary(summaryData)
    } catch (e) {
      console.error('Failed to load tracker', e)
    } finally {
      setTrackerLoading(false)
    }
  }, [trackerMarket])

  useEffect(() => {
    loadResults()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [loadResults])

  useEffect(() => {
    fetchDailySummary()
      .then(d => { if (d?.summary) setDailySummary(d) })
      .catch(() => {})
  }, [])

  // Fetch sector flow top stocks for cross-reference (TW only)
  useEffect(() => {
    if (market !== 'tw') { setFlowHotCodes(new Set()); return }
    fetchSectorFlowTw()
      .then(data => {
        if (!data?.sectors) return
        const codes = new Set<string>()
        data.sectors.forEach((s: any) => {
          // Take top-30 stocks by total_net across all sectors
          ;(s.stocks ?? []).forEach((st: any) => codes.add(st.code))
        })
        // Sort all stocks and keep top 30 by total_net
        const allStocks: any[] = data.sectors.flatMap((s: any) => s.stocks ?? [])
        allStocks.sort((a, b) => b.total_net - a.total_net)
        const top30 = new Set(allStocks.slice(0, 30).map((st: any) => st.code))
        setFlowHotCodes(top30)
      })
      .catch(() => {})
  }, [market])

  useEffect(() => {
    if (activeTab === 'tracker') loadTracker()
  }, [activeTab, loadTracker])

  // 大盤狀態（頁面載入時抓一次）
  useEffect(() => {
    fetchMarketState()
      .then(data => { if (data) setMarketState(data) })
      .catch(() => {})
  }, [])

  // 今日綜合候選榜：合併台股/美股 BUY 訊號（依三重ST訊號品質+籌碼共振排序）
  // + 加密貨幣進場訊號，讓使用者不用切分頁就能看到全市場最值得關注的標的
  useEffect(() => {
    (async () => {
      setTopLoading(true)
      try {
        const [twRes, usRes, flow, cryptoRes] = await Promise.all([
          fetchScannerResults('tw').catch(() => null),
          fetchScannerResults('us').catch(() => null),
          fetchSectorFlowTw().catch(() => null),
          fetchCryptoStrategyStatus().catch(() => null),
        ])

        const hotCodes = new Set<string>()
        if (flow?.sectors) {
          const allStocks: any[] = flow.sectors.flatMap((s: any) => s.stocks ?? [])
          allStocks.sort((a, b) => b.total_net - a.total_net)
          allStocks.slice(0, 30).forEach((st: any) => hotCodes.add(st.code))
        }

        // 每日掃描只用三重ST策略，所有 BUY 訊號的 trend_score/entry_score 都相同
        // （BUY 定義本身就是「三條全翻多」），無法用來區分好壞。改用 Claude 分析
        // 解析出的進場時機（🟢立即進場 > 🟡等回踩 > 🔴觀望）當主要排序依據，
        // 這是實際看過支撐壓力/RSI/量能之後的判斷，比固定分數更有意義。
        const build = (data: any, m: 'tw' | 'us'): TopCandidate[] =>
          (data?.results ?? [])
            .filter((r: any) => r.signal === 'BUY')
            .map((r: any) => {
              const resonance = m === 'tw' && hotCodes.has(r.symbol)
              const timing = getEntryTiming(r.claude_analysis)
              const timingScore = timing === '🟢' ? 30 : timing === '🟡' ? 20 : timing === '🔴' ? 10 : 0
              const upgraded = isUpgradedFromWatch(r.signal_history ?? [])
              return {
                market: m,
                symbol: r.symbol,
                name: r.name,
                sector: r.sector,
                close: r.close,
                change_pct: r.change_pct,
                signal_label: r.signal_label,
                score: timingScore + (resonance ? 5 : 0) + (upgraded ? 2 : 0) + (r.earnings_soon ? -3 : 0),
                resonance,
                timing,
                upgraded,
              }
            })

        const combined = [...build(twRes, 'tw'), ...build(usRes, 'us')]
          .sort((a, b) => b.score - a.score)
        setTopCandidates(combined)

        const cryptoLong: TopCryptoEntry[] = (cryptoRes?.signals ?? [])
          .filter((s: any) => s.signal === 'LONG')
          .map((s: any) => ({ symbol: s.symbol, strategy: s.strategy, reason: s.reason, price: s.price }))
        setTopCrypto(cryptoLong)
      } catch {
        // 靜默失敗，面板不顯示即可
      } finally {
        setTopLoading(false)
      }
    })()
  }, [])

  const handleScan = async () => {
    setError(null)
    try {
      await triggerScan(market)
      setScanning(true)
      pollRef.current = setTimeout(() => loadResults(true), 5000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '無法啟動掃描，請確認後端服務是否正常運行')
    }
  }

  const handleClosePosition = async (symbol: string) => {
    if (!confirm(`確定要手動關閉 ${symbol} 的追蹤部位？`)) return
    setClosingSymbol(symbol)
    try {
      await closeTrackerPosition(symbol)
      await loadTracker()
    } catch (e) {
      alert(`關閉失敗`)
    } finally {
      setClosingSymbol(null)
    }
  }

  const handleSearchHistory = async () => {
    if (!historySymbol.trim()) return
    setHistoryLoading(true)
    setHistoryError(null)
    setHistoryData(null)
    try {
      const data = await fetchSymbolHistory(historySymbol.trim(), historyMarket)
      setHistoryData(data)
    } catch (e: any) {
      setHistoryError('查詢失敗，請確認後端服務是否正常')
    } finally {
      setHistoryLoading(false)
    }
  }

  // 策略條件：大盤3綠 + 旺季（10–4月）
  const strategyOk = !!(marketState?.tw && marketState.tw.green_count === 3 && marketState.in_season)
  const strategyWarn = !!(marketState?.tw && marketState.tw.green_count === 3 && !marketState.in_season)

  const filteredResults = (scanData?.results || []).filter(r => {
    if (signalFilter === 'ALL') return true
    if (signalFilter === 'STRATEGY') return r.signal === 'BUY' && strategyOk
    return r.signal === signalFilter
  })

  const buyCount = (scanData?.results || []).filter(r => r.signal === 'BUY').length
  const watchCount = (scanData?.results || []).filter(r => r.signal === 'WATCH').length
  const strategyCount = (scanData?.results || []).filter(r => r.signal === 'BUY').length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 標題區 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">每日掃描器</h1>
          <p className="text-gray-400 text-sm mt-1">
            台股 08:00 / 美股 21:00 自動掃描（台灣時間，週一至週五）
          </p>
        </div>
        {activeTab === 'scan' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button onClick={() => setMarket('tw')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${market === 'tw' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                台股
              </button>
              <button onClick={() => setMarket('us')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${market === 'us' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                美股
              </button>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
              {scanning ? '掃描中...' : '立即掃描'}
            </button>
          </div>
        )}
      </div>

      {/* 大盤 ST 狀態列 */}
      {marketState && (
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          {/* 加權指數 ST */}
          {(['tw', 'us'] as const).map(m => {
            const s = marketState[m]
            if (!s) return null
            const g = s.green_count
            const label = m === 'tw' ? '加權指數' : 'S&P 500'
            const dots = [0, 1, 2].map(i => (
              <span key={i} className={`inline-block w-2.5 h-2.5 rounded-full ${i < g ? 'bg-green-400' : 'bg-red-500'}`} />
            ))
            const cls =
              g === 3 ? 'text-green-400 bg-green-900/30 border-green-700'
              : g === 2 ? 'text-yellow-400 bg-yellow-900/30 border-yellow-700'
              : 'text-red-400 bg-red-900/30 border-red-700'
            return (
              <div key={m} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${cls}`}>
                <span className="text-gray-400 font-medium">{label}</span>
                <span className="flex gap-1 items-center">{dots}</span>
                <span className="font-semibold">{g}/3</span>
                <span className="text-gray-500 text-xs">{s.close.toLocaleString()} · {s.date}</span>
              </div>
            )
          })}

          {/* 月份季節 */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
            marketState.in_season
              ? 'text-green-400 bg-green-900/30 border-green-700'
              : 'text-red-400 bg-red-900/30 border-red-700'
          }`}>
            <span className="text-gray-400 font-medium">{marketState.month}月</span>
            <span className="font-semibold">{marketState.in_season ? '旺季 ✓' : '淡季 ✗'}</span>
          </div>

          {/* 綜合建議（台股用） */}
          {marketState.tw && (() => {
            const ok = marketState.tw.green_count === 3 && marketState.in_season
            const warn = marketState.tw.green_count === 3 && !marketState.in_season
            return (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold ${
                ok   ? 'text-green-300 bg-green-900/40 border-green-600'
                : warn ? 'text-yellow-300 bg-yellow-900/30 border-yellow-600'
                : 'text-gray-400 bg-gray-800 border-gray-700'
              }`}>
                {ok ? '✅ 策略全開－可積極進場'
                  : warn ? '⚠️ 大盤強但淡季－謹慎進場'
                  : '🚫 條件不足－建議觀望'}
              </div>
            )
          })()}
        </div>
      )}

      {/* 今日綜合候選榜（跨台股/美股/加密貨幣） */}
      {!topLoading && (topCandidates.length > 0 || topCrypto.length > 0) && (
        <div className="mb-6 bg-gray-800/80 border border-amber-800/60 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700/50 flex items-center gap-2 flex-wrap">
            <span className="text-amber-400 font-semibold text-sm">🏆 今日綜合候選榜</span>
            <span className="text-gray-500 text-xs">跨台股/美股（依進場時機＋籌碼共振排序，未產出分析的排最後）＋加密貨幣進場訊號</span>
          </div>
          <div className="p-4 space-y-4">
            {topCandidates.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {topCandidates.slice(0, 8).map((c, i) => (
                  <button
                    key={`${c.market}-${c.symbol}`}
                    onClick={() => { setMarket(c.market); setActiveTab('scan'); setExpandedSymbol(c.symbol) }}
                    className="text-left bg-gray-700 hover:bg-gray-600 rounded-lg p-2.5 transition-colors border border-gray-600"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">#{i + 1} {c.market === 'tw' ? '🇹🇼' : '🇺🇸'}</span>
                      <span className="flex items-center gap-1">
                        {c.resonance && <span className="text-cyan-400 text-[10px]" title="籌碼共振">💠</span>}
                        {c.upgraded && <span className="text-purple-400 text-[10px]" title="WATCH升級">↑</span>}
                      </span>
                    </div>
                    <div className="text-white font-bold text-sm truncate">{c.symbol}</div>
                    <div className="text-gray-400 text-xs truncate">{c.name || c.sector}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-xs ${c.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {c.change_pct > 0 ? '+' : ''}{c.change_pct}%
                      </span>
                      <span className="text-xs">
                        {c.timing ? <EntryTimingBadge timing={c.timing} /> : <span className="text-gray-500">分析中</span>}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {topCrypto.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2">🪙 加密貨幣進場訊號（策略各異，不併入上方分數）</div>
                <div className="flex flex-wrap gap-2">
                  {topCrypto.map(c => (
                    <button
                      key={c.symbol}
                      onClick={() => router.push('/crypto')}
                      className="bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-2 text-xs text-white border border-gray-600 transition-colors"
                    >
                      <span className="font-bold">{c.symbol}</span>
                      <span className="text-gray-400 ml-2">{c.strategy}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 切換 */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'scan' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          掃描結果
        </button>
        <button
          onClick={() => setActiveTab('tracker')}
          className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'tracker' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          訊號追蹤
          {trackerSummary && trackerSummary.open_count > 0 && (
            <span className="px-1.5 py-0.5 bg-green-700 text-green-200 rounded-full text-xs font-bold">
              {trackerSummary.open_count}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          個股查詢
        </button>
      </div>

      {/* ── 掃描結果 Tab ── */}
      {activeTab === 'scan' && (
        <>
          {/* 每日總結面板 */}
          {dailySummary && (
            <div className="mb-6 bg-gray-800/80 border border-blue-800/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowSummary(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-semibold text-sm">📋 今日盤後總結</span>
                  <span className="text-gray-500 text-xs">{dailySummary.date?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')} · {dailySummary.generated?.slice(11, 16)}</span>
                </div>
                <span className="text-gray-400 text-xs">{showSummary ? '▲' : '▼'}</span>
              </button>
              {showSummary && (
                <div className="px-5 pb-5 pt-1 border-t border-gray-700/50">
                  <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {dailySummary.summary.split('\n').map((line, i) => {
                      if (/^【.+】/.test(line.trim())) {
                        return <p key={i} className="text-blue-300 font-semibold mt-4 mb-1 border-b border-gray-700/60 pb-1">{line}</p>
                      }
                      if (line.startsWith('- ') || line.match(/^\d+\./)) {
                        return <p key={i} className="text-gray-300 pl-3 mt-0.5">{line}</p>
                      }
                      return <p key={i} className="text-gray-300 mt-0.5">{line}</p>
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {scanning && (
            <div className="mb-6 p-4 bg-blue-900/40 border border-blue-700 rounded-lg text-blue-300 text-sm flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin flex-shrink-0" />
              掃描進行中，{market === 'tw' ? '台股約需 5-10 分鐘' : '美股約需 2-3 分鐘'}，請耐心等候...
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* 統計概覽 */}
          {scanData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">掃描股票數</div>
                <div className="text-2xl font-bold text-white">{(scanData.total_scanned || 0).toLocaleString()}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">技術篩選通過</div>
                <div className="text-2xl font-bold text-yellow-400">{scanData.pre_screened || 0}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">買入訊號</div>
                <div className="text-2xl font-bold text-green-400">{buyCount}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">觀察訊號</div>
                <div className="text-2xl font-bold text-yellow-400">{watchCount}</div>
              </div>
            </div>
          )}

          {/* 名詞解釋 */}
          {scanData && (
            <div className="mb-4">
              <button
                onClick={() => setShowGlossary(v => !v)}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                <span className="w-4 h-4 rounded-full border border-gray-600 flex items-center justify-center text-[10px] font-bold">?</span>
                名詞解釋
                {showGlossary ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showGlossary && (
                <div className="mt-2 p-4 bg-gray-800/60 border border-gray-700 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 text-xs">
                  {([
                    ['EV（期望值）', '歷史所有訊號觸發後的平均報酬率，正值代表長期有利，負值代表不利。'],
                    ['WR（勝率）', '歷史訊號觸發後獲利次數的比例。高WR不代表EV高，需搭配看。'],
                    ['RSI', '相對強弱指數（0–100）。>70 偏高/超買，<30 偏低/超賣，50 為多空分界。'],
                    ['量比', '今日成交量 ÷ 20日均量。>1.5x 為放量，<0.8x 為縮量，放量突破更可信。'],
                    ['SuperTrend（ST）', 'ATR為基礎的趨勢線，綠色（多方）= 支撐，紅色（空方）= 壓力。'],
                    ['三重ST', '本策略使用三組參數：(11,2.0)/(10,1.0)/(12,3.0)，三條全翻多才觸發 BUY。'],
                    ['BUY', '三條ST今日同時翻多（由空轉多），為主要進場訊號。'],
                    ['WATCH', '2/3條ST翻多，等待第三條確認。翻多後進入BUY清單。'],
                    ['ATR', '平均真實波幅，衡量股票每日波動幅度。用於設定ST參數與估算距離。'],
                    ['EMA20/50/200', '20/50/200日指數移動平均線，分別代表短/中/長期趨勢方向。'],
                    ['當日止損', '三條ST支撐線最高值，每日更新。ST翻空且跌破進場價自動出場。'],
                    ['假突破', '股價短暫突破ST但隨即跌回，訊號失效。量能不足或連漲後易出現。'],
                    ['籌碼共振', '三大法人（外資+投信）今日同步大量買超，與技術訊號雙重確認。'],
                    ['WATCH升級', '前日為WATCH，今日升為BUY，代表觀察後正式確認翻多，品質較佳。'],
                    ['加碼計畫', '以進場價與訊號當時止損算出的風險單位（R），規劃 +1R/+2R 分批加碼點位與對應停損上移，讓獲利逐步鎖定。首倉50%，加碼各30%/20%。'],
                  ] as [string, string][]).map(([term, desc]) => (
                    <div key={term} className="flex gap-2">
                      <span className="text-blue-400 font-medium shrink-0 min-w-[100px]">{term}</span>
                      <span className="text-gray-400">{desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status && (
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-4">
              <Clock size={13} />
              上次掃描：{formatTime(status[market]?.last_scan_time)}
              {status.schedule && <span className="ml-2 text-gray-500">｜排程：{status.schedule[market]}</span>}
            </div>
          )}

          {/* 訊號過濾 */}
          {scanData && (scanData.results || []).length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-gray-400 text-sm">過濾：</span>
              {(['ALL', 'BUY', 'WATCH'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setSignalFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${signalFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'}`}
                >
                  {f === 'ALL' ? `全部 (${buyCount + watchCount})` : f === 'BUY' ? `買入 (${buyCount})` : `觀察 (${watchCount})`}
                </button>
              ))}
              <button
                onClick={() => setSignalFilter('STRATEGY')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  signalFilter === 'STRATEGY'
                    ? 'bg-green-600 text-white border-green-500'
                    : strategyOk
                      ? 'bg-green-900/40 text-green-300 border-green-700 hover:bg-green-900/60'
                      : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                }`}
                disabled={!strategyOk}
                title={strategyOk ? '大盤3綠 + 旺季，條件全符合' : '目前不符合策略條件（大盤未達3綠或淡季）'}
              >
                ✅ 策略符合 ({strategyOk ? buyCount : 0})
              </button>
              <span className="text-gray-500 text-xs ml-2">顯示 {filteredResults.length} 支</span>
            </div>
          )}

          {/* 結果列表 */}
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <RefreshCw size={32} className="animate-spin text-blue-400" />
            </div>
          ) : !scanData || (scanData.results || []).length === 0 ? (
            <div className="text-center py-20">
              <div className="text-gray-500 text-lg mb-2">{scanData?.message || '尚無掃描結果'}</div>
              <div className="text-gray-600 text-sm mb-6">點擊「立即掃描」開始分析股票訊號</div>
              <button onClick={handleScan} disabled={scanning} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                開始掃描
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map(result => {
                const isExpanded = expandedSymbol === result.symbol
                return (
                  <div key={result.symbol} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                    <div
                      className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
                      onClick={() => setExpandedSymbol(isExpanded ? null : result.symbol)}
                    >
                      {/* K 線縮圖 */}
                      <div className="flex-shrink-0">
                        <img
                          src={getScannerChartUrl(result.symbol)}
                          alt={`${result.symbol} chart`}
                          className="w-48 h-28 object-cover rounded-lg bg-gray-700"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>

                      {/* 股票資訊 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-bold text-lg">{result.symbol}</span>
                          {result.name !== result.symbol && <span className="text-gray-400 text-sm">{result.name}</span>}
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{result.sector}</span>
                          <SignalBadge signal={result.signal} />
                          {flowHotCodes.has(result.symbol) && (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                              籌碼共振
                            </span>
                          )}
                          {result.signal === 'BUY' && isUpgradedFromWatch(result.signal_history) && (() => {
                            const streak = watchStreak(result.signal_history)
                            return (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/70 text-purple-300 border border-purple-700/50">
                                ↑ WATCH {streak > 1 ? `×${streak}` : ''}升級
                              </span>
                            )
                          })()}
                          {result.signal === 'BUY' && (
                            <EntryTimingBadge timing={getEntryTiming(result.claude_analysis)} />
                          )}
                          {result.signal === 'BUY' && marketState && (
                            strategyOk ? (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/60 text-green-300 border border-green-700/50">
                                ✅ 策略全符合
                              </span>
                            ) : strategyWarn ? (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-700/50">
                                ⚠️ 淡季謹慎
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/40 text-red-400 border border-red-800/50">
                                🚫 大盤未達標
                              </span>
                            )
                          )}
                          {result.earnings_soon && (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-900/60 text-orange-300 border border-orange-700/50" title={`財報日：${result.earnings_date ?? '近期'}`}>
                              📅 財報近期
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="text-white font-medium">{result.close}</span>
                          <span className={`text-sm font-medium ${result.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {result.change_pct >= 0 ? '+' : ''}{result.change_pct}%
                          </span>
                          <span className="text-gray-400 text-sm">RSI: {result.rsi}</span>
                          <span className="text-gray-400 text-sm">量比: {result.volume_ratio}x</span>
                          <span className="text-gray-500 text-xs">趨勢:{result.trend_score} 進場:{result.entry_score}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(result.trigger_reasons || []).map(reason => (
                            <span key={reason} className="px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs border border-blue-800">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 右側收折箭頭 */}
                      <div className="flex-shrink-0 flex items-center text-gray-500">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* 展開詳情 */}
                    {isExpanded && (
                      <div className="border-t border-gray-700 p-4 bg-gray-900/50 space-y-4">
                        {/* 上方：Claude 分析（左）+ K 線圖（右） */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            {result.claude_analysis ? (
                              <div>
                                <div className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wide flex items-center gap-1">
                                  <span>🤖 Claude 分析</span>
                                </div>
                                <div className="text-sm leading-relaxed space-y-1">
                                  {result.claude_analysis.split('\n').map((line, i) => {
                                    if (!line.trim()) return <div key={i} className="h-1" />
                                    const boldLine = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
                                    // 【區塊標題】
                                    if (/^【.+】/.test(line.trim())) {
                                      return <p key={i} className="text-blue-300 font-semibold mt-3 mb-1 border-b border-gray-700/60 pb-1" dangerouslySetInnerHTML={{ __html: boldLine }} />
                                    }
                                    if (line.startsWith('**')) {
                                      return <p key={i} className="text-blue-300 font-medium mt-2" dangerouslySetInnerHTML={{ __html: boldLine }} />
                                    }
                                    if (line.startsWith('- ')) {
                                      return <p key={i} className="text-gray-300 pl-3" dangerouslySetInnerHTML={{ __html: '· ' + boldLine.slice(2) }} />
                                    }
                                    return <p key={i} className="text-gray-300" dangerouslySetInnerHTML={{ __html: boldLine }} />
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">Claude 分析排程於台股 08:22 / 美股 21:20 自動執行</div>
                            )}
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wide">K 線圖</div>
                            <img
                              src={getScannerChartUrl(result.symbol)}
                              alt={`${result.symbol} chart`}
                              className="w-full rounded-lg bg-gray-700"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        </div>

                        {/* 加碼計畫（分批建倉，以進場當時 R 值計算，僅供規劃參考） */}
                        {result.signal === 'BUY' && (result.add_on_levels?.length ?? 0) > 0 && (
                          <div>
                            <div className="text-gray-400 text-xs mb-2 font-medium uppercase tracking-wide">
                              📈 加碼計畫（金字塔式，首倉 50%）
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(result.add_on_levels ?? []).map(lv => (
                                <div key={lv.level} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-amber-300 font-semibold">{lv.label}</span>
                                    <span className="text-gray-500 text-xs">加碼 {lv.weight_pct}%</span>
                                  </div>
                                  <div className="text-white font-bold">{lv.price}</div>
                                  <div className="text-gray-500 text-xs mt-1">{lv.new_stop_label}：{lv.new_stop}</div>
                                </div>
                              ))}
                            </div>
                            <div className="text-gray-600 text-xs mt-2">
                              ※ 以進場價與訊號當時止損算出的風險單位（R）計算，僅為分批建倉規劃參考，非即時更新
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── 訊號追蹤 Tab ── */}
      {activeTab === 'tracker' && (
        <>
          {/* 市場過濾 + 刷新 */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['all', 'tw', 'us'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTrackerMarket(m)}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${trackerMarket === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {m === 'all' ? '全部' : m === 'tw' ? '台股' : '美股'}
                </button>
              ))}
            </div>
            <button onClick={loadTracker} disabled={trackerLoading} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors">
              <RefreshCw size={14} className={trackerLoading ? 'animate-spin' : ''} />
              刷新
            </button>
          </div>

          {/* 績效摘要 */}
          {trackerSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">持倉中</div>
                <div className="text-2xl font-bold text-white">{trackerSummary.open_count}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">已完成交易</div>
                <div className="text-2xl font-bold text-white">{trackerSummary.total_closed}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">勝率</div>
                <div className="text-2xl font-bold text-white">{trackerSummary.win_rate != null ? `${trackerSummary.win_rate}%` : '—'}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-400 text-xs mb-1">平均損益</div>
                <div className={`text-2xl font-bold ${trackerSummary.avg_pnl_pct != null ? pnlColor(trackerSummary.avg_pnl_pct) : 'text-white'}`}>
                  {trackerSummary.avg_pnl_pct != null ? `${pnlPrefix(trackerSummary.avg_pnl_pct)}${trackerSummary.avg_pnl_pct}%` : '—'}
                </div>
              </div>
            </div>
          )}

          {trackerSummary && trackerSummary.total_closed > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-xs text-gray-400 space-y-1">
                <div className="font-medium text-gray-300 mb-2">已實現績效</div>
                <div>累計損益：<span className={`font-medium ${pnlColor(trackerSummary.total_pnl_pct ?? 0)}`}>{pnlPrefix(trackerSummary.total_pnl_pct ?? 0)}{trackerSummary.total_pnl_pct}%</span></div>
                <div>平均持有：<span className="text-white">{trackerSummary.avg_hold_days} 天</span></div>
                <div>未實現均損益：<span className={`font-medium ${trackerSummary.open_unrealized_pct != null ? pnlColor(trackerSummary.open_unrealized_pct) : 'text-gray-400'}`}>{trackerSummary.open_unrealized_pct != null ? `${pnlPrefix(trackerSummary.open_unrealized_pct)}${trackerSummary.open_unrealized_pct}%` : '—'}</span></div>
              </div>
              {trackerSummary.best_trade && (
                <div className="bg-gray-800 rounded-lg p-4 border border-green-800 text-xs space-y-1">
                  <div className="font-medium text-green-400 mb-2">最佳交易</div>
                  <div className="text-white font-bold">{trackerSummary.best_trade.symbol}</div>
                  <div className={`text-lg font-bold ${pnlColor(trackerSummary.best_trade.pnl_pct)}`}>{pnlPrefix(trackerSummary.best_trade.pnl_pct)}{trackerSummary.best_trade.pnl_pct}%</div>
                  <div className="text-gray-400">{trackerSummary.best_trade.exit_date}</div>
                </div>
              )}
              {trackerSummary.worst_trade && (
                <div className="bg-gray-800 rounded-lg p-4 border border-red-800 text-xs space-y-1">
                  <div className="font-medium text-red-400 mb-2">最差交易</div>
                  <div className="text-white font-bold">{trackerSummary.worst_trade.symbol}</div>
                  <div className={`text-lg font-bold ${pnlColor(trackerSummary.worst_trade.pnl_pct)}`}>{pnlPrefix(trackerSummary.worst_trade.pnl_pct)}{trackerSummary.worst_trade.pnl_pct}%</div>
                  <div className="text-gray-400">{trackerSummary.worst_trade.exit_date}</div>
                </div>
              )}
            </div>
          )}

          {/* 開放部位 */}
          <div className="mb-2">
            <h2 className="text-white font-semibold text-lg mb-3">持倉追蹤 ({openPositions.length})</h2>
            {trackerLoading ? (
              <div className="flex justify-center py-10"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
            ) : openPositions.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <div className="mb-2">目前無追蹤部位</div>
                <div className="text-sm">每日掃描出現 BUY 訊號時會自動加入追蹤</div>
              </div>
            ) : (
              <div className="space-y-2">
                {openPositions.map(pos => (
                  <div key={pos.symbol} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-bold text-lg">{pos.symbol}</span>
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{pos.market.toUpperCase()}</span>
                          {pos.sector && <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{pos.sector}</span>}
                          <SignalBadge signal={pos.signal} />
                          {pos.green_count === 2 && (
                            <span className="px-2 py-0.5 bg-yellow-900/60 text-yellow-300 rounded text-xs border border-yellow-700 animate-pulse">⚠️ ST 警戒</span>
                          )}
                          {pos.chart_pattern && <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs border border-purple-800">{pos.chart_pattern}</span>}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap text-sm">
                          <span className="text-gray-400">進場：<span className="text-white font-medium">{pos.entry_price}</span></span>
                          <span className="text-gray-400">現價：<span className="text-white font-medium">{pos.current_price}</span></span>
                          <span className={`font-bold text-base ${pnlColor(pos.current_pnl_pct)}`}>
                            {pnlPrefix(pos.current_pnl_pct)}{pos.current_pnl_pct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>進場日：{pos.entry_date} <span className="text-gray-500">({Math.floor((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)} 天)</span></span>
                          <span>當日止損：<span className="text-red-400">{pos.current_sl ?? pos.sl ?? '—'}</span></span>
                          {pos.green_count !== undefined && (
                            <span>ST多方：<span className={pos.green_count === 2 ? 'text-yellow-400' : 'text-green-400'}>{pos.green_count}/3</span></span>
                          )}
                          <span>趨勢:{pos.trend_score} 進場:{pos.entry_score}</span>
                        </div>
                        {pos.entry_zone && (pos.entry_zone.low || pos.entry_zone.high) && (
                          <div className="mt-1 text-xs text-gray-500">進場區間：{pos.entry_zone.low ?? '—'} ~ {pos.entry_zone.high ?? '—'}</div>
                        )}
                        {pos.add_on_levels && pos.add_on_levels.length > 0 && (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-gray-500">加碼計畫：</span>
                            {pos.add_on_levels.map(lv => {
                              const reached = pos.current_price >= lv.price
                              return (
                                <span
                                  key={lv.level}
                                  className={`text-xs px-2 py-0.5 rounded border ${
                                    reached
                                      ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                                      : 'bg-gray-700/50 text-gray-500 border-gray-700'
                                  }`}
                                  title={`${lv.new_stop_label}：${lv.new_stop}`}
                                >
                                  {reached ? '✅ ' : ''}{lv.label} {lv.price}（{lv.weight_pct}%）
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => handleClosePosition(pos.symbol)}
                          disabled={closingSymbol === pos.symbol}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-xs transition-colors border border-red-800"
                        >
                          <X size={12} />
                          {closingSymbol === pos.symbol ? '關閉中...' : '手動出場'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 績效分析 */}
          {trackerSummary && trackerSummary.total_closed > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-white font-semibold text-lg">績效分析</h2>

              {/* 進場時機準確度 */}
              {trackerSummary.timing_stats && Object.keys(trackerSummary.timing_stats).length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">進場時機準確度</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['🟢', '🟡', '🔴'] as const).map(timing => {
                      const s = trackerSummary.timing_stats[timing]
                      if (!s) return null
                      const label = timing === '🟢' ? '立即進場' : timing === '🟡' ? '等回踩' : '觀望'
                      const borderColor = timing === '🟢' ? 'border-green-700' : timing === '🟡' ? 'border-yellow-700' : 'border-gray-600'
                      return (
                        <div key={timing} className={`bg-gray-700/50 rounded-lg p-3 border ${borderColor}`}>
                          <div className="text-sm font-bold mb-1">{timing} {label}</div>
                          <div className="text-xs text-gray-400 space-y-0.5">
                            <div>交易次數：<span className="text-white">{s.count}</span></div>
                            <div>勝率：<span className={s.win_rate != null && s.win_rate >= 50 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>{s.win_rate != null ? `${s.win_rate}%` : '—'}</span></div>
                            <div>平均損益：<span className={s.avg_pnl != null ? pnlColor(s.avg_pnl) : 'text-gray-400'}>{s.avg_pnl != null ? `${pnlPrefix(s.avg_pnl)}${s.avg_pnl}%` : '—'}</span></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {Object.keys(trackerSummary.timing_stats).length > 0 && (
                    <p className="text-gray-500 text-xs mt-2">※ 僅統計 Claude 分析已完成且有進場時機標籤的交易</p>
                  )}
                </div>
              )}

              {/* 板塊勝率 */}
              {trackerSummary.sector_stats && trackerSummary.sector_stats.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">板塊績效</div>
                  <div className="space-y-1.5">
                    {trackerSummary.sector_stats.map(s => (
                      <div key={s.sector} className="flex items-center gap-3 text-xs">
                        <span className="text-gray-300 w-24 truncate flex-shrink-0">{s.sector}</span>
                        <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(s.win_rate ?? 0) >= 50 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${s.win_rate ?? 0}%` }}
                          />
                        </div>
                        <span className={`w-10 text-right font-medium ${(s.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400'}`}>{s.win_rate != null ? `${s.win_rate}%` : '—'}</span>
                        <span className="text-gray-500 w-16 text-right">{s.count} 筆 {s.avg_pnl != null ? `${pnlPrefix(s.avg_pnl)}${s.avg_pnl}%` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 月度損益 */}
              {trackerSummary.monthly_stats && trackerSummary.monthly_stats.length > 0 && (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">月度損益</div>
                  <div className="space-y-1.5">
                    {trackerSummary.monthly_stats.map(m => (
                      <div key={m.month} className="flex items-center gap-3 text-xs">
                        <span className="text-gray-300 w-16 flex-shrink-0">{m.month}</span>
                        <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.total_pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(Math.abs(m.total_pnl) * 2, 100)}%` }}
                          />
                        </div>
                        <span className={`w-16 text-right font-medium ${pnlColor(m.total_pnl)}`}>{pnlPrefix(m.total_pnl)}{m.total_pnl}%</span>
                        <span className="text-gray-500 w-20 text-right">{m.count} 筆 勝率{m.win_rate ?? '—'}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 歷史部位 */}
          <div className="mt-6">
            <button
              onClick={() => setShowClosed(!showClosed)}
              className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-medium mb-3 transition-colors"
            >
              {showClosed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              歷史出場紀錄（{closedPositions.length}）
            </button>
            {showClosed && (
              <div className="overflow-x-auto rounded-xl border border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 text-gray-400 text-xs">
                      <th className="px-4 py-3 text-left">代號</th>
                      <th className="px-4 py-3 text-left">市場</th>
                      <th className="px-4 py-3 text-left">進場時機</th>
                      <th className="px-4 py-3 text-right">進場價</th>
                      <th className="px-4 py-3 text-right">出場價</th>
                      <th className="px-4 py-3 text-right">損益</th>
                      <th className="px-4 py-3 text-right">持有天數</th>
                      <th className="px-4 py-3 text-left">出場原因</th>
                      <th className="px-4 py-3 text-left">進場日</th>
                      <th className="px-4 py-3 text-left">出場日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((pos, idx) => (
                      <tr key={`${pos.symbol}-${pos.exit_date}-${idx}`} className="border-t border-gray-700 hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-medium text-white">{pos.symbol}</td>
                        <td className="px-4 py-3 text-gray-400">{pos.market.toUpperCase()}</td>
                        <td className="px-4 py-3 text-center">{(pos as any).entry_timing ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{pos.entry_price}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{pos.exit_price}</td>
                        <td className={`px-4 py-3 text-right font-bold ${pnlColor(pos.pnl_pct)}`}>
                          {pnlPrefix(pos.pnl_pct)}{pos.pnl_pct}%
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{pos.holding_days}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            pos.exit_reason?.includes('翻空') || pos.exit_reason?.includes('止損')
                              ? 'bg-red-900/40 text-red-400'
                              : pos.exit_reason === '手動出場'
                              ? 'bg-yellow-900/40 text-yellow-400'
                              : 'text-gray-400'
                          }`}>{pos.exit_reason}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{pos.entry_date}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{pos.exit_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 個股歷史查詢 Tab ── */}
      {activeTab === 'history' && (
        <>
          <div className="mb-6">
            <h2 className="text-white font-semibold text-lg mb-1">個股歷史訊號查詢</h2>
            <p className="text-gray-500 text-sm">查詢某支股票在所有歷史掃描中出現 BUY / WATCH 的紀錄</p>
          </div>

          {/* 搜尋列 */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['tw', 'us'] as const).map(m => (
                <button key={m} onClick={() => setHistoryMarket(m)}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${historyMarket === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {m === 'tw' ? '台股' : '美股'}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={historySymbol}
              onChange={e => setHistorySymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearchHistory()}
              placeholder={historyMarket === 'tw' ? '輸入代號，例如 2330' : '輸入代號，例如 NVDA'}
              className="flex-1 min-w-0 max-w-xs px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSearchHistory}
              disabled={historyLoading || !historySymbol.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
              查詢
            </button>
          </div>

          {historyError && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm flex items-center gap-2">
              <AlertCircle size={14} /> {historyError}
            </div>
          )}

          {historyData && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-white font-bold text-xl">{historyData.symbol}</span>
                <span className="text-gray-400 text-sm">共出現 {historyData.records.length} 次</span>
                {historyData.records.length > 0 && (() => {
                  const buyCount = historyData.records.filter((r: any) => r.signal === 'BUY').length
                  const watchCount = historyData.records.filter((r: any) => r.signal === 'WATCH').length
                  return (
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs font-bold">BUY ×{buyCount}</span>
                      <span className="px-2 py-0.5 bg-yellow-900 text-yellow-300 rounded text-xs font-bold">WATCH ×{watchCount}</span>
                    </div>
                  )
                })()}
              </div>

              {historyData.records.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <div className="text-lg mb-2">此代號在歷史掃描中未出現過</div>
                  <div className="text-sm">只有觸發 BUY 或 WATCH 的股票才會被記錄</div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800 text-gray-400 text-xs">
                        <th className="px-4 py-3 text-left">日期</th>
                        <th className="px-4 py-3 text-left">訊號</th>
                        <th className="px-4 py-3 text-right">收盤價</th>
                        <th className="px-4 py-3 text-right">漲跌%</th>
                        <th className="px-4 py-3 text-right">RSI</th>
                        <th className="px-4 py-3 text-right">量比</th>
                        <th className="px-4 py-3 text-right">趨勢分</th>
                        <th className="px-4 py-3 text-right">進場分</th>
                        <th className="px-4 py-3 text-left">觸發原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.records.map((rec: any, idx: number) => (
                        <tr key={idx} className="border-t border-gray-700 hover:bg-gray-800/50">
                          <td className="px-4 py-3 text-gray-300">{rec.date}</td>
                          <td className="px-4 py-3">
                            <SignalBadge signal={rec.signal} />
                          </td>
                          <td className="px-4 py-3 text-right text-white font-medium">{rec.close ?? '—'}</td>
                          <td className={`px-4 py-3 text-right font-medium ${rec.change_pct != null ? (rec.change_pct >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-400'}`}>
                            {rec.change_pct != null ? `${rec.change_pct >= 0 ? '+' : ''}${rec.change_pct}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">{rec.rsi ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{rec.volume_ratio != null ? `${rec.volume_ratio}x` : '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{rec.trend_score ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{rec.entry_score ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                            {(rec.trigger_reasons || []).join('、')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!historyData && !historyLoading && (
            <div className="text-center py-20 text-gray-500">
              <div className="text-lg mb-2">輸入股票代號開始查詢</div>
              <div className="text-sm">可查詢此股票在歷史所有掃描日期中出現的紀錄</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
