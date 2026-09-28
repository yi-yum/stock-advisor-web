'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, TrendingUp, Clock, BarChart2, Target } from 'lucide-react'
import { fetchScanHistoryList, fetchScanHistoryDetail, fetchTrackerSummary } from '@/lib/api'

interface TopSignal {
  symbol: string
  close: number
  signal?: string
  strategy?: string
  rsi?: number
  trigger_reasons?: string[]
  gemini_analysis?: {
    direction: string
    signal_strength: number
    entry_price: number
    stop_loss: number
    take_profit: number
    analysis: string
  } | null
}

interface HistoryEntry {
  filename: string
  market: string
  scan_time: string
  total_scanned: number
  pre_screened: number
  analyzed: number
  buy_count: number
  top_signals: TopSignal[]
}

interface TimingStat {
  count: number
  wins: number
  total_pnl: number
  win_rate: number | null
  avg_pnl: number | null
}

interface TrackerSummary {
  total_closed: number
  win_rate: number | null
  avg_pnl_pct: number | null
  open_count: number
  timing_stats: Record<string, TimingStat>
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ [key: string]: any }>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [trackerSummary, setTrackerSummary] = useState<TrackerSummary | null>(null)

  useEffect(() => {
    fetchScanHistoryList()
      .then(d => { setHistory(d.history || []); setLoading(false) })
      .catch(() => { setError('載入失敗'); setLoading(false) })

    fetchTrackerSummary()
      .then(d => setTrackerSummary(d))
      .catch(() => {})
  }, [])

  const loadDetail = async (filename: string) => {
    if (detail[filename]) {
      setExpanded(expanded === filename ? null : filename)
      return
    }
    setLoadingDetail(filename)
    try {
      const d = await fetchScanHistoryDetail(filename)
      setDetail(prev => ({ ...prev, [filename]: d }))
      setExpanded(filename)
    } catch {
      setError('載入詳情失敗')
    } finally {
      setLoadingDetail(null)
    }
  }

  const formatTime = (iso: string) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) }
    catch { return iso }
  }

  const marketLabel = (m: string) => m === 'tw' ? '台股' : '美股'
  const marketColor = (m: string) => m === 'tw' ? 'text-red-400' : 'text-blue-400'

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <RefreshCw className="animate-spin text-blue-400" size={32} />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">歷史紀錄</h1>
        <p className="text-gray-400 text-sm mt-1">每日掃描結果自動存檔，點擊可展開查看詳情</p>
      </div>

      {/* 分析命中率 */}
      {trackerSummary && trackerSummary.total_closed > 0 && (
        <div className="mb-6 bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-purple-400" />
            <span className="text-white font-semibold text-sm">Claude 分析命中率</span>
            <span className="text-gray-500 text-xs ml-1">（已關倉 {trackerSummary.total_closed} 筆，開放中 {trackerSummary.open_count} 筆）</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 整體勝率 */}
            <div className="bg-gray-900/60 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">
                {trackerSummary.win_rate != null ? `${trackerSummary.win_rate}%` : '—'}
              </div>
              <div className="text-gray-400 text-xs mt-0.5">整體勝率</div>
              {trackerSummary.avg_pnl_pct != null && (
                <div className={`text-xs mt-0.5 ${trackerSummary.avg_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  均損益 {trackerSummary.avg_pnl_pct > 0 ? '+' : ''}{trackerSummary.avg_pnl_pct}%
                </div>
              )}
            </div>
            {/* 按時機標籤分組 */}
            {(['🟢', '🟡', '🔴'] as const).map(emoji => {
              const stat = trackerSummary.timing_stats?.[emoji]
              if (!stat) return null
              return (
                <div key={emoji} className="bg-gray-900/60 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-white">
                    {stat.win_rate != null ? `${stat.win_rate}%` : '—'}
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {emoji} 勝率 <span className="text-gray-500">({stat.count}筆)</span>
                  </div>
                  {stat.avg_pnl != null && (
                    <div className={`text-xs mt-0.5 ${stat.avg_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      均 {stat.avg_pnl > 0 ? '+' : ''}{stat.avg_pnl}%
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="text-gray-600 text-xs mt-2">
            🟢 直接進場　🟡 等確認再進　🔴 跳過本次　— 依 Claude 明日開盤建議標籤統計
          </div>
        </div>
      )}


      {error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <BarChart2 size={48} className="mx-auto mb-4 opacity-30" />
          <div>尚無歷史紀錄</div>
          <div className="text-sm mt-1">每日掃描完成後會自動存檔在此</div>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(entry => {
            const isExpanded = expanded === entry.filename
            const detailData = detail[entry.filename]

            return (
              <div key={entry.filename} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                {/* 摘要列 */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
                  onClick={() => loadDetail(entry.filename)}
                >
                  {/* 市場標籤 */}
                  <div className={`text-lg font-bold w-12 text-center ${marketColor(entry.market)}`}>
                    {marketLabel(entry.market)}
                  </div>

                  {/* 時間 */}
                  <div className="flex-1">
                    <div className="text-white font-medium">{formatTime(entry.scan_time)}</div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      掃描 {entry.total_scanned.toLocaleString()} 支 → 篩出 {entry.pre_screened} 支
                    </div>
                  </div>

                  {/* 買入訊號數 */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{entry.buy_count}</div>
                    <div className="text-gray-400 text-xs">買入訊號</div>
                  </div>

                  {/* 前3個訊號預覽 */}
                  <div className="hidden sm:flex gap-1">
                    {entry.top_signals.slice(0, 3).map(s => (
                      <span key={s.symbol} className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs border border-green-800">
                        {s.symbol}
                      </span>
                    ))}
                  </div>

                  {/* 展開圖標 */}
                  <div className="text-gray-500">
                    {loadingDetail === entry.filename
                      ? <RefreshCw size={16} className="animate-spin" />
                      : isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    }
                  </div>
                </div>

                {/* 展開詳情 */}
                {isExpanded && detailData && (
                  <div className="border-t border-gray-700 p-4">
                    <div className="text-gray-400 text-xs mb-3 font-medium uppercase tracking-wide">
                      買入訊號股票（{(detailData.results || []).filter((r: any) =>
                        r.signal === 'BUY' || r.gemini_analysis?.direction === 'BUY'
                      ).length} 支）
                    </div>
                    <div className="space-y-2">
                      {(detailData.results || [])
                        .filter((r: any) => r.signal === 'BUY' || r.gemini_analysis?.direction === 'BUY')
                        .map((r: any) => {
                          const g = r.gemini_analysis
                          return (
                            <div key={r.symbol} className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
                              <div className="w-20">
                                <div className="text-white font-bold">{r.symbol}</div>
                                <div className="text-gray-400 text-xs">{r.sector}</div>
                              </div>
                              <div className="text-white">{r.close}</div>
                              <div className="flex-1">
                                <div className="flex flex-wrap gap-1">
                                  {(r.trigger_reasons || []).map((t: string) => (
                                    <span key={t} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs">{t}</span>
                                  ))}
                                </div>
                              </div>
                              {g && (
                                <div className="text-right text-xs text-gray-400 space-y-0.5">
                                  <div>進場 <span className="text-white">{g.entry_price}</span></div>
                                  <div>止損 <span className="text-red-400">{g.stop_loss}</span></div>
                                  <div>止盈 <span className="text-green-400">{g.take_profit}</span></div>
                                </div>
                              )}
                              {!g && r.tp && (
                                <div className="text-right text-xs text-gray-400 space-y-0.5">
                                  <div>進場 <span className="text-white">{r.entry_price || r.close}</span></div>
                                  <div>止損 <span className="text-red-400">{r.sl}</span></div>
                                  <div>止盈 <span className="text-green-400">{r.tp}</span></div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
