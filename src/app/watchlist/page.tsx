'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Clock, Plus, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchWatchlist, addToWatchlist, removeFromWatchlist, fetchWatchlistSignals } from '@/lib/api'

const REFRESH_INTERVAL = 60 * 60 // 1 小時（秒）

interface WatchlistItem { symbol: string; asset_type: string; note: string; added_at: string }

interface SignalResult {
  symbol: string
  asset_type: string
  note: string
  price?: number
  change_pct?: number
  rsi?: number
  macd_histogram?: number
  volume_ratio?: number
  above_ma20?: boolean
  ma20?: number
  pct_from_52w_high?: number
  bb_position?: string
  signal?: 'BUY' | 'WATCH' | 'WAIT'
  signal_label?: string
  can_enter?: boolean
  score?: number
  reasons?: string[]
  sl?: number
  tp?: number
  rr?: number
  updated_at?: string
  error?: string
  regime?: 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'UNCERTAIN'
  strategy?: string
}

const signalCfg = {
  BUY:   { bg: 'bg-green-900/30', border: 'border-green-600', text: 'text-green-400', icon: TrendingUp },
  WATCH: { bg: 'bg-yellow-900/20', border: 'border-yellow-700', text: 'text-yellow-400', icon: Minus },
  WAIT:  { bg: 'bg-gray-800', border: 'border-gray-700', text: 'text-gray-500', icon: TrendingDown },
}

const assetEmoji: Record<string, string> = { us: '🇺🇸', taiwan: '🇹🇼', crypto: '🪙' }

function fmtPrice(v?: number | null, asset?: string) {
  if (v === null || v === undefined) return '—'
  const prefix = asset === 'taiwan' ? 'NT$' : '$'
  return `${prefix}${v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(4)}`
}
function fmtPct(v?: number | null) {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ── 單張訊號卡 ────────────────────────────────────────
function SignalCard({ result }: { result: SignalResult }) {
  const [expanded, setExpanded] = useState(false)
  const sig = result.signal ?? 'WAIT'
  const cfg = signalCfg[sig]
  const Icon = cfg.icon

  if (result.error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-center justify-between">
        <span className="font-bold text-red-400">{result.symbol}</span>
        <span className="text-xs text-red-500">{result.error}</span>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border-2 ${cfg.bg} ${cfg.border} overflow-hidden transition-all`}>
      {/* ── 主列 ── */}
      <div
        className="p-4 cursor-pointer flex items-center gap-4"
        onClick={() => setExpanded(v => !v)}
      >
        {/* 訊號圓點 */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          sig === 'BUY' ? 'bg-green-500/20' : sig === 'WATCH' ? 'bg-yellow-500/20' : 'bg-gray-700'
        }`}>
          <Icon className={`w-5 h-5 ${cfg.text}`} />
        </div>

        {/* 代號 + 資產類型 */}
        <div className="flex-shrink-0 w-28">
          <div className="font-bold text-white">{result.symbol}</div>
          <div className="text-xs text-gray-500">
            {assetEmoji[result.asset_type ?? 'us']} {result.note || result.asset_type}
          </div>
        </div>

        {/* 價格 */}
        <div className="flex-shrink-0 w-28 text-right">
          <div className="font-semibold text-white">{fmtPrice(result.price, result.asset_type)}</div>
          <div className={`text-xs ${(result.change_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtPct(result.change_pct)}
          </div>
        </div>

        {/* 訊號標籤 */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            {result.regime && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                result.regime === 'TREND_UP'   ? 'bg-green-900/50 text-green-400' :
                result.regime === 'TREND_DOWN' ? 'bg-red-900/50 text-red-400' :
                result.regime === 'RANGE'      ? 'bg-blue-900/50 text-blue-400' :
                                                 'bg-gray-700 text-gray-400'
              }`}>
                {result.regime === 'TREND_UP'   ? '↑ 趨勢多頭' :
                 result.regime === 'TREND_DOWN' ? '↓ 趨勢空頭' :
                 result.regime === 'RANGE'      ? '↔ 盤整' : '? 不明確'}
              </span>
            )}
            {result.strategy && (
              <span className="text-xs text-gray-500">{result.strategy}</span>
            )}
          </div>
          <span className={`text-lg font-black ${cfg.text}`}>{result.signal_label}</span>
          <div className="text-xs text-gray-500 mt-0.5">評分 {result.score ?? 0} / 10</div>
        </div>

        {/* RSI + MACD */}
        <div className="hidden md:flex gap-4 flex-shrink-0">
          <div className="text-center">
            <div className="text-xs text-gray-400">RSI</div>
            <div className={`text-sm font-semibold ${
              (result.rsi ?? 50) < 30 ? 'text-green-400' : (result.rsi ?? 50) > 70 ? 'text-red-400' : 'text-gray-200'
            }`}>{result.rsi?.toFixed(1) ?? '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">MACD</div>
            <div className={`text-sm font-semibold ${(result.macd_histogram ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(result.macd_histogram ?? 0) > 0 ? '金叉' : '死叉'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">量比</div>
            <div className={`text-sm font-semibold ${(result.volume_ratio ?? 1) > 1.2 ? 'text-blue-400' : 'text-gray-400'}`}>
              {result.volume_ratio?.toFixed(1) ?? '—'}x
            </div>
          </div>
        </div>

        {/* 展開 */}
        <div className="text-gray-500 ml-2">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* ── 展開詳情 ── */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-4 pb-4 pt-3 space-y-3">
          {/* SL/TP */}
          {result.can_enter && result.sl && result.tp && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">進場參考</div>
                <div className="font-bold text-white">{fmtPrice(result.price, result.asset_type)}</div>
              </div>
              <div className="bg-red-900/20 rounded-lg p-3 text-center border border-red-900/50">
                <div className="text-xs text-gray-400 mb-1">止損 SL</div>
                <div className="font-bold text-red-400">{fmtPrice(result.sl, result.asset_type)}</div>
                {result.price && result.sl && (
                  <div className="text-xs text-red-600">{fmtPct(((result.sl - result.price) / result.price) * 100)}</div>
                )}
              </div>
              <div className="bg-green-900/20 rounded-lg p-3 text-center border border-green-900/50">
                <div className="text-xs text-gray-400 mb-1">目標 TP</div>
                <div className="font-bold text-green-400">{fmtPrice(result.tp, result.asset_type)}</div>
                {result.rr && (
                  <div className="text-xs text-yellow-500">風報比 {result.rr}</div>
                )}
              </div>
            </div>
          )}

          {/* 指標補充 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-2">
              <div className="text-gray-500">MA20</div>
              <div className={result.above_ma20 ? 'text-green-400' : 'text-red-400'}>
                {result.above_ma20 ? '站上' : '跌破'} {fmtPrice(result.ma20, result.asset_type)}
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-2">
              <div className="text-gray-500">距52W高</div>
              <div className="text-gray-300">{fmtPct(result.pct_from_52w_high)}</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-2">
              <div className="text-gray-500">布林位置</div>
              <div className="text-gray-300 truncate">{result.bb_position ?? '—'}</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-2">
              <div className="text-gray-500">評分</div>
              <div className={result.score! >= 6 ? 'text-green-400' : result.score! >= 4 ? 'text-yellow-400' : 'text-gray-400'}>
                {result.score} / 10
              </div>
            </div>
          </div>

          {/* 評分理由 */}
          {result.reasons && result.reasons.length > 0 && (
            <div className="space-y-1">
              {result.reasons.map((r, i) => (
                <div key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                  <span className="text-gray-600 mt-0.5">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 主頁面 ────────────────────────────────────────────
export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [signals, setSignals] = useState<SignalResult[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSignals, setLoadingSignals] = useState(false)
  const [signalError, setSignalError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const countdownRef = useRef(REFRESH_INTERVAL)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // 管理面板狀態
  const [showManage, setShowManage] = useState(false)
  const [inputSymbols, setInputSymbols] = useState('')
  const [inputNote, setInputNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  // 過濾
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'WATCH' | 'WAIT'>('ALL')

  const loadWatchlist = useCallback(async () => {
    try {
      const data = await fetchWatchlist()
      setWatchlist(data || [])
    } catch { setWatchlist([]) }
    finally { setLoadingList(false) }
  }, [])

  const loadSignals = useCallback(async () => {
    setLoadingSignals(true)
    setSignalError(null)
    try {
      const data = await fetchWatchlistSignals()
      setSignals(data || [])
      countdownRef.current = REFRESH_INTERVAL
      setCountdown(REFRESH_INTERVAL)
    } catch (e: any) {
      setSignalError(e.message || '掃描失敗')
    } finally {
      setLoadingSignals(false)
    }
  }, [])

  // 初始載入
  useEffect(() => {
    loadWatchlist()
    loadSignals()
  }, [loadWatchlist, loadSignals])

  // 1小時倒數計時 + 自動刷新
  useEffect(() => {
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1
      setCountdown(countdownRef.current)
      if (countdownRef.current <= 0) loadSignals()
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loadSignals])

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleAdd = async () => {
    const syms = inputSymbols.split('\n').map(s => s.trim().toUpperCase()).filter(Boolean)
    if (!syms.length) return
    setAdding(true)
    try {
      for (const sym of syms) await addToWatchlist(sym, inputNote || undefined)
      await loadWatchlist()
      setInputSymbols(''); setInputNote('')
      loadSignals()
    } catch { alert('加入失敗') }
    finally { setAdding(false) }
  }

  const handleRemove = async (symbol: string) => {
    setRemoving(symbol)
    try {
      await removeFromWatchlist(symbol)
      await loadWatchlist()
      setSignals(prev => prev.filter(s => s.symbol !== symbol))
    } catch { alert('刪除失敗') }
    finally { setRemoving(null) }
  }

  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.signal === filter || (!s.signal && filter === 'WAIT'))
  const buyCount = signals.filter(s => s.signal === 'BUY').length
  const watchCount = signals.filter(s => s.signal === 'WATCH').length

  return (
    <div className="space-y-5">
      {/* ── 標題列 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">📌 自選股監控</h1>
          <p className="text-gray-400 text-sm mt-1">技術入場訊號 · 每小時自動更新</p>
        </div>
        <div className="flex items-center gap-2">
          {signals.length > 0 && (
            <div className="flex items-center gap-1.5 text-gray-400 text-sm bg-gray-800 px-3 py-2 rounded-lg">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{formatCountdown(countdown)}</span>
            </div>
          )}
          <button
            onClick={loadSignals}
            disabled={loadingSignals}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSignals ? 'animate-spin' : ''}`} />
            立即更新
          </button>
          <button
            onClick={() => setShowManage(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition"
          >
            <Plus className="w-4 h-4" />
            管理清單
          </button>
        </div>
      </div>

      {/* ── 管理面板（可收折）── */}
      {showManage && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
          <h2 className="font-semibold text-gray-200">管理自選股</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 新增 */}
            <div className="space-y-3">
              <textarea
                value={inputSymbols}
                onChange={e => setInputSymbols(e.target.value)}
                placeholder={'例如：\nAAPL\nMSFT\n2330.TW'}
                rows={4}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
              <input
                value={inputNote}
                onChange={e => setInputNote(e.target.value)}
                placeholder="備注（選填）"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !inputSymbols.trim()}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
              >
                {adding ? '加入中...' : '+ 加入清單'}
              </button>
            </div>
            {/* 現有清單 */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {loadingList ? (
                <p className="text-gray-400 text-sm">載入中...</p>
              ) : watchlist.length === 0 ? (
                <p className="text-gray-500 text-sm">尚無自選股</p>
              ) : watchlist.map(item => (
                <div key={item.symbol} className="flex items-center justify-between bg-gray-700 px-3 py-2 rounded text-sm">
                  <div>
                    <span className="font-medium">{item.symbol}</span>
                    {item.note && <span className="text-gray-400 text-xs ml-2">{item.note}</span>}
                  </div>
                  <button
                    onClick={() => handleRemove(item.symbol)}
                    disabled={removing === item.symbol}
                    className="p-1 text-gray-400 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 統計概覽 ── */}
      {signals.length > 0 && !loadingSignals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-green-400">{buyCount}</div>
            <div className="text-xs text-gray-400 mt-1">買入時機</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-yellow-400">{watchCount}</div>
            <div className="text-xs text-gray-400 mt-1">觀察中</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-gray-400">{signals.length - buyCount - watchCount}</div>
            <div className="text-xs text-gray-400 mt-1">等待中</div>
          </div>
        </div>
      )}

      {/* ── 過濾器 ── */}
      {signals.length > 0 && (
        <div className="flex gap-2">
          {(['ALL', 'BUY', 'WATCH', 'WAIT'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'ALL' ? '全部' : f === 'BUY' ? '買入時機' : f === 'WATCH' ? '觀察中' : '等待'}
            </button>
          ))}
        </div>
      )}

      {/* ── 載入中 ── */}
      {loadingSignals && (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">掃描自選股中，請稍候...</p>
          <p className="text-gray-600 text-xs mt-1">每支股票約需 3-5 秒</p>
        </div>
      )}

      {/* ── 錯誤 ── */}
      {signalError && !loadingSignals && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-400 text-sm">
          掃描失敗：{signalError}
        </div>
      )}

      {/* ── 空清單 ── */}
      {!loadingSignals && !loadingList && watchlist.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-12 text-center border border-dashed border-gray-700">
          <p className="text-gray-400">尚無自選股</p>
          <p className="text-gray-600 text-sm mt-2">點擊「管理清單」加入股票代號</p>
        </div>
      )}

      {/* ── 訊號卡列表 ── */}
      {!loadingSignals && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(result => (
            <SignalCard key={result.symbol} result={result} />
          ))}
          <p className="text-xs text-gray-600 text-right">
            最後更新：{signals[0]?.updated_at ? new Date(signals[0].updated_at).toLocaleTimeString('zh-TW') : '—'}
          </p>
        </div>
      )}
    </div>
  )
}
