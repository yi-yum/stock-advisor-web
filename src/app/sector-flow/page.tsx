'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { fetchSectorFlowTw, fetchSectorFlowTwHistory, fetchSectorFlowUs, fetchScannerResults } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface StockData {
  code: string
  name: string
  foreign_net: number
  trust_net: number
  dealer_net: number
  total_net: number
  streak?: number      // positive = buy streak days, negative = sell streak days
}

interface SectorData {
  name: string
  foreign_net: number
  trust_net: number
  dealer_net: number
  total_net: number
  stock_count: number
  top_stocks: string[]
  stocks: StockData[]
}

interface FlowResponse {
  date: string
  sectors: SectorData[]
  total_foreign: number
  total_trust: number
  total_dealer: number
  source: string
}

interface HistoryResponse {
  dates: string[]
  date_from: string
  date_to: string
  days: number
  sectors: SectorData[]
  total_foreign: number
  total_trust: number
  total_dealer: number
  source: string
}

interface BubblePoint extends SectorData {
  x: number
  y: number
  z: number
}

interface UsSector {
  name: string
  ticker: string
  change_pct: number
  vs_spy: number
  volume_ratio: number
  close: number
  trend: 'up' | 'down' | 'flat'
}

interface UsFlowResponse {
  market: 'us'
  period_days: number
  date_from: string
  date_to: string
  spy_change_pct: number
  sectors: UsSector[]
  source: string
}

type MarketMode = 'tw' | 'us'
type ViewMode = 'single' | 'history'
type DaysOption = 5 | 10 | 20
type InstKey = 'total_net' | 'foreign_net' | 'trust_net' | 'dealer_net'

// ── Helpers ──────────────────────────────────────────────────────────────────

const INST_OPTS: { key: InstKey; label: string }[] = [
  { key: 'total_net',   label: '三大合計' },
  { key: 'foreign_net', label: '外資' },
  { key: 'trust_net',   label: '投信' },
  { key: 'dealer_net',  label: '自營' },
]

const getBubbleColor = (totalNet: number): string => {
  if (totalNet > 50000)  return '#16a34a'
  if (totalNet > 20000)  return '#22c55e'
  if (totalNet > 5000)   return '#4ade80'
  if (totalNet > 0)      return '#86efac'
  if (totalNet > -5000)  return '#fca5a5'
  if (totalNet > -20000) return '#f87171'
  if (totalNet > -50000) return '#ef4444'
  return '#dc2626'
}

const getBarColor = (v: number) => v >= 0 ? '#22c55e' : '#ef4444'

const fmt萬 = (n: number): string => {
  const wan = n / 10000
  const sign = wan >= 0 ? '+' : ''
  return `${sign}${wan.toFixed(1)}萬`
}

const fmtDate = (d: string): string =>
  d.length === 8 ? `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}` : d

// ── Scanner Signal Badge ──────────────────────────────────────────────────────

const ScannerBadge = ({ signal }: { signal?: 'BUY' | 'WATCH' }) => {
  if (!signal) return null
  if (signal === 'BUY')
    return <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded font-bold bg-green-900/60 text-green-300 border border-green-700/40">BUY</span>
  return <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-700/40">WATCH</span>
}

// ── Streak Badge ──────────────────────────────────────────────────────────────

const StreakBadge = ({ streak }: { streak?: number }) => {
  if (!streak || Math.abs(streak) < 2) return null
  const buy = streak > 0
  return (
    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-medium ${
      buy ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
    }`}>
      {buy ? `連買${streak}日` : `連賣${Math.abs(streak)}日`}
    </span>
  )
}

// ── Custom Bubble ─────────────────────────────────────────────────────────────

interface BubbleShapeProps {
  cx?: number; cy?: number; payload?: BubblePoint; size?: number
}

const BubbleShape = ({ cx = 0, cy = 0, payload, size = 400 }: BubbleShapeProps) => {
  if (!payload) return null
  const r = Math.sqrt(size / Math.PI)
  const color = getBubbleColor(payload.total_net)
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.85}
        stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />
      {r > 18 && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize={Math.min(12, r * 0.55)} fontWeight="600" fill="#0f172a"
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {payload.name.length > 5 ? payload.name.slice(0, 5) : payload.name}
        </text>
      )}
    </g>
  )
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

const BubbleTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: BubblePoint }> }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]!.payload
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-xl p-4 text-sm shadow-2xl min-w-[220px]">
      <p className="font-bold text-white text-base mb-3">{d.name}</p>
      <div className="space-y-1.5">
        {[['外資', d.foreign_net], ['投信', d.trust_net], ['自營', d.dealer_net]].map(([l, v]) => (
          <div key={l as string} className="flex justify-between">
            <span className="text-gray-400">{l}</span>
            <span className={(v as number) >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>{fmt萬(v as number)} 張</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
          <span className="text-gray-300 font-semibold">三大合計</span>
          <span className={d.total_net >= 0 ? 'text-green-300 font-bold' : 'text-red-300 font-bold'}>{fmt萬(d.total_net)} 張</span>
        </div>
      </div>
    </div>
  )
}

const BarTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: SectorData }> }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]!.payload
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm shadow-2xl min-w-[200px]">
      <p className="font-bold text-white mb-2">{d.name}</p>
      <div className="space-y-1">
        {[['外資', d.foreign_net], ['投信', d.trust_net], ['自營', d.dealer_net]].map(([l, v]) => (
          <div key={l as string} className="flex justify-between gap-4">
            <span className="text-gray-400">{l}</span>
            <span className={(v as number) >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt萬(v as number)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-gray-700 pt-1 mt-1">
          <span className="text-gray-300 font-semibold">合計</span>
          <span className={d.total_net >= 0 ? 'text-green-300 font-bold' : 'text-red-300 font-bold'}>{fmt萬(d.total_net)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SectorFlowPage() {
  const router = useRouter()

  const [marketMode, setMarketMode]   = useState<MarketMode>('tw')
  const [viewMode, setViewMode]       = useState<ViewMode>('single')
  const [daysOption, setDaysOption]   = useState<DaysOption>(5)
  const [instFilter, setInstFilter]   = useState<InstKey>('total_net')
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set())

  // Scanner cross-reference (TW only)
  const [scannerMap, setScannerMap]   = useState<Map<string, 'BUY' | 'WATCH'>>(new Map())

  // US sector flow
  const [usData, setUsData]           = useState<UsFlowResponse | null>(null)
  const [usLoading, setUsLoading]     = useState(false)
  const [usError, setUsError]         = useState<string | null>(null)
  const [usDays, setUsDays]           = useState<DaysOption>(20)

  const [singleData, setSingleData]   = useState<FlowResponse | null>(null)
  const [singleLoading, setSingleLoading] = useState(true)
  const [singleError, setSingleError] = useState<string | null>(null)
  const [singleUpdatedAt, setSingleUpdatedAt] = useState('')

  const [histData, setHistData]       = useState<HistoryResponse | null>(null)
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError]     = useState<string | null>(null)
  const [histUpdatedAt, setHistUpdatedAt] = useState('')

  const toggleSector = (name: string) => setExpandedSectors(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  const fetchSingle = useCallback(async () => {
    setSingleLoading(true); setSingleError(null)
    try {
      setSingleData(await fetchSectorFlowTw())
      setSingleUpdatedAt(new Date().toLocaleTimeString('zh-TW'))
    } catch (e: unknown) {
      setSingleError(e instanceof Error ? e.message : '資料載入失敗')
    } finally { setSingleLoading(false) }
  }, [])

  const fetchHistory = useCallback(async (days: DaysOption) => {
    setHistLoading(true); setHistError(null)
    try {
      setHistData(await fetchSectorFlowTwHistory(days))
      setHistUpdatedAt(new Date().toLocaleTimeString('zh-TW'))
    } catch (e: unknown) {
      setHistError(e instanceof Error ? e.message : '資料載入失敗')
    } finally { setHistLoading(false) }
  }, [])

  const fetchUs = useCallback(async (days: DaysOption) => {
    setUsLoading(true); setUsError(null)
    try {
      setUsData(await fetchSectorFlowUs(days))
    } catch (e: unknown) {
      setUsError(e instanceof Error ? e.message : '資料載入失敗')
    } finally { setUsLoading(false) }
  }, [])

  useEffect(() => { fetchSingle() }, [fetchSingle])
  useEffect(() => { if (viewMode === 'history') fetchHistory(daysOption) }, [viewMode, daysOption, fetchHistory])
  useEffect(() => { if (marketMode === 'us') fetchUs(usDays) }, [marketMode, usDays, fetchUs])

  // Fetch scanner signals for cross-reference (TW only)
  useEffect(() => {
    if (marketMode !== 'tw') { setScannerMap(new Map()); return }
    fetchScannerResults('tw')
      .then(data => {
        const map = new Map<string, 'BUY' | 'WATCH'>()
        ;(data?.results ?? []).forEach((r: any) => {
          if (r.signal === 'BUY' || r.signal === 'WATCH') map.set(r.symbol, r.signal)
        })
        setScannerMap(map)
      })
      .catch(() => {})
  }, [marketMode])

  // Bubble data (single mode)
  const MAX_Z = 8000, MIN_Z = 300
  const bubbleData: BubblePoint[] = singleData?.sectors.map(s => ({
    ...s,
    x: s.foreign_net / 10000,
    y: s.trust_net / 10000,
    z: Math.max(MIN_Z, Math.min(MAX_Z, Math.abs(s.total_net) / 10 + MIN_Z)),
  })) ?? []

  const loading = viewMode === 'single' ? singleLoading : histLoading
  const error   = viewMode === 'single' ? singleError   : histError
  const sectors     = viewMode === 'single' ? singleData?.sectors     : histData?.sectors
  const totalFor    = viewMode === 'single' ? singleData?.total_foreign : histData?.total_foreign
  const totalTrust  = viewMode === 'single' ? singleData?.total_trust   : histData?.total_trust
  const totalDealer = viewMode === 'single' ? singleData?.total_dealer  : histData?.total_dealer

  // All individual stocks with sector label
  interface RankedStock extends StockData { sector: string }
  const allStocks: RankedStock[] = sectors?.flatMap(s =>
    (s.stocks ?? []).map(st => ({ ...st, sector: s.name }))
  ) ?? []
  const top10Buy  = [...allStocks].sort((a, b) => b[instFilter] - a[instFilter]).slice(0, 10)
  const top10Sell = [...allStocks].sort((a, b) => a[instFilter] - b[instFilter]).slice(0, 10)

  // Bar chart data (history mode)
  const barData = sectors ? [...sectors].sort((a, b) => a.total_net - b.total_net) : []

  // Sector rotation: today vs N-day average (only when both datasets available)
  interface RotationItem { name: string; today: number; avg: number; delta: number }
  const rotationData: RotationItem[] = (viewMode === 'history' && singleData && histData && histData.days > 1)
    ? histData.sectors.map(hs => {
        const today = singleData.sectors.find(s => s.name === hs.name)?.total_net ?? 0
        const avg   = hs.total_net / histData.days
        return { name: hs.name, today, avg, delta: today - avg }
      }).sort((a, b) => b.delta - a.delta)
    : []
  const rotationUp   = rotationData.slice(0, 5)
  const rotationDown = [...rotationData].reverse().slice(0, 5)

  // Inst label helper
  const instLabel = (key: InstKey) => INST_OPTS.find(o => o.key === key)?.label ?? ''

  // Navigate to backtest
  const goBacktest = (code: string) => {
    router.push(`/backtest?symbol=${code}.TW&market=tw`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">台股板塊資金流向</h1>
          {marketMode === 'tw' && viewMode === 'single' && singleData && (
            <p className="text-gray-400 text-sm mt-1">
              資料日期：{fmtDate(singleData.date)}　更新：{singleUpdatedAt}　來源：{singleData.source}
            </p>
          )}
          {marketMode === 'tw' && viewMode === 'history' && histData && histData.days > 0 && (
            <p className="text-gray-400 text-sm mt-1">
              累計 {histData.days} 個交易日（{fmtDate(histData.date_from)} ～ {fmtDate(histData.date_to)}）　更新：{histUpdatedAt}
            </p>
          )}
          {marketMode === 'us' && usData && (
            <p className="text-gray-400 text-sm mt-1">
              {usDays} 日相對強弱（{usData.date_from} ～ {usData.date_to}）　SPY：{usData.spy_change_pct >= 0 ? '+' : ''}{usData.spy_change_pct}%　來源：{usData.source}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Market switch */}
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            {(['tw', 'us'] as MarketMode[]).map(m => (
              <button key={m} onClick={() => setMarketMode(m)}
                className={`px-4 py-2 transition-colors ${marketMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {m === 'tw' ? '台股' : '美股'}
              </button>
            ))}
          </div>

          {/* TW: single/history tabs */}
          {marketMode === 'tw' && (
            <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
              {(['single', 'history'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-4 py-2 transition-colors ${viewMode === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {m === 'single' ? '單日' : '累計'}
                </button>
              ))}
            </div>
          )}

          {/* TW history days / US days */}
          {marketMode === 'tw' && viewMode === 'history' && (
            <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
              {([5, 10, 20] as DaysOption[]).map(d => (
                <button key={d} onClick={() => setDaysOption(d)}
                  className={`px-3 py-2 transition-colors ${daysOption === d ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {d}日
                </button>
              ))}
            </div>
          )}
          {marketMode === 'us' && (
            <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
              {([5, 10, 20] as DaysOption[]).map(d => (
                <button key={d} onClick={() => setUsDays(d)}
                  className={`px-3 py-2 transition-colors ${usDays === d ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {d}日
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (marketMode === 'us') fetchUs(usDays)
              else if (viewMode === 'single') fetchSingle()
              else fetchHistory(daysOption)
            }}
            disabled={marketMode === 'tw' ? loading : usLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
            {(marketMode === 'tw' ? loading : usLoading)
              ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />載入中…</>
              : '重新整理'}
          </button>
        </div>
      </div>

      {(marketMode === 'tw' ? error : usError) && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300">
          載入失敗：{marketMode === 'tw' ? error : usError}
        </div>
      )}

      {/* ══ US SECTOR FLOW ══ */}
      {marketMode === 'us' && (
        usLoading && !usData
          ? <div className="flex items-center justify-center h-96 bg-gray-800 rounded-xl"><span className="text-gray-400">資料載入中，請稍候…</span></div>
          : usData && usData.sectors.length > 0 && (
            <div className="space-y-4">
              {/* SPY reference card */}
              <div className="bg-gray-800 rounded-xl p-4 flex items-center gap-6">
                <div>
                  <p className="text-gray-400 text-sm">標普500 (SPY) {usDays}日報酬</p>
                  <p className={`text-2xl font-bold ${usData.spy_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {usData.spy_change_pct >= 0 ? '+' : ''}{usData.spy_change_pct}%
                  </p>
                </div>
                <p className="text-gray-500 text-xs">
                  板塊相對強弱 = 板塊報酬 − SPY 報酬<br />
                  正值表示跑贏大盤（資金流入強勢），負值表示落後大盤
                </p>
              </div>

              {/* Sector bar chart: vs SPY */}
              <div className="bg-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">板塊相對強弱 vs SPY（{usDays} 日）</h2>
                <p className="text-xs text-gray-500 mb-4">正值 = 跑贏 SPY，負值 = 跑輸 SPY</p>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart
                    data={[...usData.sectors].sort((a, b) => a.vs_spy - b.vs_spy)}
                    layout="vertical"
                    margin={{ top: 4, right: 80, bottom: 4, left: 110 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number"
                      tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                      tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#4b5563' }} tickLine={{ stroke: '#4b5563' }} />
                    <YAxis type="category" dataKey="name" width={104}
                      tick={{ fill: '#d1d5db', fontSize: 12 }} axisLine={{ stroke: '#4b5563' }} tickLine={false} />
                    <ReferenceLine x={0} stroke="#6b7280" strokeWidth={1.5} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]!.payload as UsSector
                        return (
                          <div className="bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm shadow-2xl">
                            <p className="font-bold text-white mb-1">{d.name} ({d.ticker})</p>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">{usDays}日報酬</span>
                                <span className={d.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}>{d.change_pct >= 0 ? '+' : ''}{d.change_pct}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">vs SPY</span>
                                <span className={d.vs_spy >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{d.vs_spy >= 0 ? '+' : ''}{d.vs_spy}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">量比</span>
                                <span className="text-gray-300">{d.volume_ratio}x</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">最新收盤</span>
                                <span className="text-gray-300">${d.close}</span>
                              </div>
                            </div>
                          </div>
                        )
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="vs_spy" radius={[0, 3, 3, 0]}>
                      {[...usData.sectors].sort((a, b) => a.vs_spy - b.vs_spy).map((entry, i) => (
                        <Cell key={i} fill={entry.vs_spy >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
                      ))}
                      <LabelList dataKey="vs_spy" position="right"
                        formatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                        style={{ fill: '#9ca3af', fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Sector detail table */}
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                <h2 className="text-white font-semibold p-4 border-b border-gray-700">板塊明細</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 bg-gray-700/50 text-right">
                      <th className="text-left px-4 py-3">板塊</th>
                      <th className="px-4 py-3">ETF</th>
                      <th className="px-4 py-3">{usDays}日報酬</th>
                      <th className="px-4 py-3">vs SPY</th>
                      <th className="px-4 py-3">量比</th>
                      <th className="px-4 py-3">收盤價</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usData.sectors.map((s, i) => (
                      <tr key={s.ticker} className={`border-t border-gray-700/50 hover:bg-gray-700/30 transition-colors ${i % 2 === 1 ? 'bg-gray-700/10' : ''}`}>
                        <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                          {s.name}
                          {s.vs_spy > 1 && <span className="text-xs text-green-400">↑強勢</span>}
                          {s.vs_spy < -1 && <span className="text-xs text-red-400">↓弱勢</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">{s.ticker}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${s.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {s.change_pct >= 0 ? '+' : ''}{s.change_pct}%
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${s.vs_spy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {s.vs_spy >= 0 ? '+' : ''}{s.vs_spy}%
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums ${s.volume_ratio > 1.2 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {s.volume_ratio}x
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">${s.close}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      )}

      {/* ══ TW SECTOR FLOW ══ */}
      {marketMode === 'tw' && totalFor !== undefined && (
        <div className="grid grid-cols-3 gap-4">
          {[['外資合計', totalFor ?? 0], ['投信合計', totalTrust ?? 0], ['自營合計', totalDealer ?? 0]].map(([label, value]) => (
            <div key={label as string} className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm">{label}</p>
              <p className={`text-xl font-bold mt-1 ${(value as number) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmt萬(value as number)} 張
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── SINGLE DAY: Bubble Chart ── */}
      {marketMode === 'tw' && viewMode === 'single' && (
        singleLoading && !singleData
          ? <div className="flex items-center justify-center h-96 bg-gray-800 rounded-xl"><span className="text-gray-400">資料載入中，請稍候…</span></div>
          : bubbleData.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-white font-semibold">外資 vs 投信 資金象限圖</h2>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />淨買超</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />淨賣超</span>
                  <span>泡泡大小 = 三大合計絕對值</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">X 軸：外資買賣超（萬張）　Y 軸：投信買賣超（萬張）　滑鼠移至泡泡查看詳情</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={500}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" name="外資" type="number"
                      tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
                      label={{ value: '外資（萬張）', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
                      tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#4b5563' }} tickLine={{ stroke: '#4b5563' }} />
                    <YAxis dataKey="y" name="投信" type="number"
                      tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
                      label={{ value: '投信（萬張）', angle: -90, position: 'insideLeft', offset: 10, fill: '#9ca3af', fontSize: 12 }}
                      tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#4b5563' }} tickLine={{ stroke: '#4b5563' }} />
                    <ZAxis dataKey="z" range={[300, 8000]} />
                    <ReferenceLine x={0} stroke="#6b7280" strokeDasharray="4 4" strokeWidth={1.5} />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" strokeWidth={1.5} />
                    <Tooltip content={<BubbleTooltip />} cursor={false} />
                    <Scatter data={bubbleData} shape={<BubbleShape />} />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="absolute top-6 right-10 text-xs text-green-500/60 font-medium pointer-events-none">外資↑ 投信↑</div>
                <div className="absolute top-6 left-10 text-xs text-yellow-500/60 font-medium pointer-events-none">外資↓ 投信↑</div>
                <div className="absolute bottom-10 right-10 text-xs text-yellow-500/60 font-medium pointer-events-none">外資↑ 投信↓</div>
                <div className="absolute bottom-10 left-10 text-xs text-red-500/60 font-medium pointer-events-none">外資↓ 投信↓</div>
              </div>
            </div>
          )
      )}

      {/* ── HISTORY: Bar Chart ── */}
      {marketMode === 'tw' && viewMode === 'history' && (
        histLoading && !histData
          ? <div className="flex items-center justify-center h-96 bg-gray-800 rounded-xl"><span className="text-gray-400">資料載入中，請稍候…</span></div>
          : barData.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">板塊累計資金流向（三大法人合計，萬張）</h2>
              <p className="text-xs text-gray-500 mb-4">依 {daysOption} 個交易日三大法人合計買賣超排序</p>
              <ResponsiveContainer width="100%" height={Math.max(420, barData.length * 28)}>
                <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v > 0 ? '+' : ''}${(v / 10000).toFixed(0)}萬`}
                    tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#4b5563' }} tickLine={{ stroke: '#4b5563' }} />
                  <YAxis type="category" dataKey="name" width={96}
                    tick={{ fill: '#d1d5db', fontSize: 12 }} axisLine={{ stroke: '#4b5563' }} tickLine={false} />
                  <ReferenceLine x={0} stroke="#6b7280" strokeWidth={1.5} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="total_net" radius={[0, 3, 3, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={getBarColor(entry.total_net)} fillOpacity={0.85} />)}
                    <LabelList dataKey="total_net" position="right" formatter={(v: number) => fmt萬(v)} style={{ fill: '#9ca3af', fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
      )}

      {/* ── ROTATION: today vs N-day average (history mode only) ── */}
      {marketMode === 'tw' && rotationData.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-white font-semibold">板塊輪動</h2>
            <span className="text-xs text-gray-500">今日 vs {histData?.days}日均值，正值 = 今日資金加速流入</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Heating up */}
            <div>
              <p className="text-xs text-green-400 font-medium mb-2">↑ 今日加速流入（高於均值）</p>
              <div className="space-y-2">
                {rotationUp.filter(r => r.delta > 0).map(r => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="text-gray-300 text-sm w-28 shrink-0">{r.name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, Math.abs(r.delta) / 5000 * 100)}%` }} />
                    </div>
                    <span className="text-green-400 text-xs tabular-nums w-16 text-right">{fmt萬(r.delta)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Cooling down */}
            <div>
              <p className="text-xs text-red-400 font-medium mb-2">↓ 今日資金減速（低於均值）</p>
              <div className="space-y-2">
                {rotationDown.filter(r => r.delta < 0).map(r => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="text-gray-300 text-sm w-28 shrink-0">{r.name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, Math.abs(r.delta) / 5000 * 100)}%` }} />
                    </div>
                    <span className="text-red-400 text-xs tabular-nums w-16 text-right">{fmt萬(r.delta)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP 10 BUY / SELL ── */}
      {marketMode === 'tw' && allStocks.length > 0 && (
        <div className="space-y-3">
          {/* Institution filter tabs */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">排行依據：</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
              {INST_OPTS.map(o => (
                <button key={o.key} onClick={() => setInstFilter(o.key)}
                  className={`px-3 py-1.5 transition-colors ${instFilter === o.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 10 Buy */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  <h2 className="text-white font-semibold text-sm">{instLabel(instFilter)} 買超前十名</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                  {viewMode === 'single' ? '單日' : `${histData?.days ?? daysOption} 日累計`}
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 bg-gray-700/30 text-right">
                    <th className="text-left pl-4 pr-2 py-2 w-6">#</th>
                    <th className="text-left px-2 py-2">股票</th>
                    <th className="px-2 py-2">外資</th>
                    <th className="px-2 py-2">投信</th>
                    <th className="px-2 py-2">自營</th>
                    <th className="px-3 py-2 text-green-400">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Buy.map((st, i) => (
                    <tr key={st.code} className="border-t border-gray-700/40 hover:bg-gray-700/30 transition-colors">
                      <td className="pl-4 pr-2 py-2.5 text-gray-600 font-mono">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center flex-wrap gap-x-1">
                          <button onClick={() => goBacktest(st.code)}
                            className="text-gray-200 font-medium hover:text-blue-400 transition-colors text-left">
                            {st.name || st.code}
                          </button>
                          <StreakBadge streak={st.streak} />
                          <ScannerBadge signal={scannerMap.get(st.code)} />
                        </div>
                        <div className="text-gray-500 font-mono">{st.code} · {st.sector}</div>
                      </td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.foreign_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.foreign_net)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.trust_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.trust_net)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.dealer_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.dealer_net)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-300 font-semibold">{fmt萬(st.total_net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top 10 Sell */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  <h2 className="text-white font-semibold text-sm">{instLabel(instFilter)} 賣超前十名</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                  {viewMode === 'single' ? '單日' : `${histData?.days ?? daysOption} 日累計`}
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 bg-gray-700/30 text-right">
                    <th className="text-left pl-4 pr-2 py-2 w-6">#</th>
                    <th className="text-left px-2 py-2">股票</th>
                    <th className="px-2 py-2">外資</th>
                    <th className="px-2 py-2">投信</th>
                    <th className="px-2 py-2">自營</th>
                    <th className="px-3 py-2 text-red-400">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Sell.map((st, i) => (
                    <tr key={st.code} className="border-t border-gray-700/40 hover:bg-gray-700/30 transition-colors">
                      <td className="pl-4 pr-2 py-2.5 text-gray-600 font-mono">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center flex-wrap gap-x-1">
                          <button onClick={() => goBacktest(st.code)}
                            className="text-gray-200 font-medium hover:text-blue-400 transition-colors text-left">
                            {st.name || st.code}
                          </button>
                          <StreakBadge streak={st.streak} />
                          <ScannerBadge signal={scannerMap.get(st.code)} />
                        </div>
                        <div className="text-gray-500 font-mono">{st.code} · {st.sector}</div>
                      </td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.foreign_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.foreign_net)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.trust_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.trust_net)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${st.dealer_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt萬(st.dealer_net)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-300 font-semibold">{fmt萬(st.total_net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTOR DETAIL TABLE ── */}
      {marketMode === 'tw' && sectors && sectors.length > 0 && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <h2 className="text-white font-semibold p-4 border-b border-gray-700">
            板塊明細（依合計排序，點擊展開個股）
            {viewMode === 'history' && histData && (
              <span className="text-gray-400 font-normal text-sm ml-2">· {histData.days} 日累計</span>
            )}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 bg-gray-700/50 text-right">
                  <th className="text-left px-4 py-3">板塊</th>
                  <th className="px-4 py-3">外資（萬張）</th>
                  <th className="px-4 py-3">投信（萬張）</th>
                  <th className="px-4 py-3">自營（萬張）</th>
                  <th className="px-4 py-3">合計（萬張）</th>
                  <th className="px-4 py-3">股票數</th>
                  <th className="px-4 py-3">代表股</th>
                </tr>
              </thead>
              {sectors.map((s, i) => {
                const isExpanded = expandedSectors.has(s.name)
                return (
                  <tbody key={s.name}>
                    <tr onClick={() => toggleSector(s.name)}
                      className={`border-t border-gray-700/50 cursor-pointer hover:bg-gray-700/40 transition-colors ${i % 2 === 1 ? 'bg-gray-700/10' : ''}`}>
                      <td className="px-4 py-3 font-medium text-white">
                        <span className="inline-flex items-center gap-2">
                          <span className={`text-gray-500 text-xs inline-block transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          {s.name}
                        </span>
                      </td>
                      {[s.foreign_net, s.trust_net, s.dealer_net, s.total_net].map((v, j) => (
                        <td key={j} className={`px-4 py-3 text-right tabular-nums ${v >= 0 ? 'text-green-400' : 'text-red-400'} ${j === 3 ? 'font-semibold' : ''}`}>
                          {fmt萬(v)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right text-gray-400">{s.stock_count}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{s.top_stocks.join(' · ')}</td>
                    </tr>

                    {isExpanded && s.stocks?.map(st => (
                      <tr key={st.code} className="border-t border-gray-700/30 bg-gray-900/60 hover:bg-gray-900/80 transition-colors">
                        <td className="pl-10 pr-4 py-2 text-gray-300">
                          <div className="flex items-center">
                            <button onClick={() => goBacktest(st.code)}
                              className="font-mono text-gray-500 text-xs mr-2 hover:text-blue-400 transition-colors">
                              {st.code}
                            </button>
                            <span>{st.name}</span>
                            <StreakBadge streak={st.streak} />
                            <ScannerBadge signal={scannerMap.get(st.code)} />
                          </div>
                        </td>
                        {[st.foreign_net, st.trust_net, st.dealer_net, st.total_net].map((v, j) => (
                          <td key={j} className={`px-4 py-2 text-right tabular-nums text-xs ${v === 0 ? 'text-gray-600' : v > 0 ? 'text-green-400' : 'text-red-400'} ${j === 3 ? 'font-medium' : ''}`}>
                            {v === 0 ? '—' : fmt萬(v)}
                          </td>
                        ))}
                        <td className="px-4 py-2" /><td className="px-4 py-2" />
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
