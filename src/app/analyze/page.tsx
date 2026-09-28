'use client'

import { useState } from 'react'
import { fetchStockData } from '@/lib/api'
import Spinner from '@/components/ui/Spinner'

// ── 顏色輔助 ──────────────────────────────────────────
const biasColor = (bias: string) =>
  bias === '偏多' ? 'text-green-400' : bias === '偏空' ? 'text-red-400' : 'text-yellow-400'
const biasIcon = (bias: string) =>
  bias === '偏多' ? '🟢' : bias === '偏空' ? '🔴' : '🟡'
const changeColor = (v: number) => v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400'
const assetLabel: Record<string, string> = { us: '🇺🇸 美股', taiwan: '🇹🇼 台股', crypto: '🪙 加密' }

// ── 指標卡片 ──────────────────────────────────────────
function MetricCard({ label, value, sub, subColor }: { label: string; value: any; sub?: string; subColor?: string }) {
  return (
    <div className="bg-gray-700 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value ?? '—'}</div>
      {sub && <div className={`text-xs mt-0.5 ${subColor ?? 'text-gray-400'}`}>{sub}</div>}
    </div>
  )
}

// ── 時框偏向卡 ────────────────────────────────────────
function TfCard({ label, tf }: { label: string; tf: any }) {
  if (!tf) return (
    <div className="bg-gray-700 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-gray-500">—</div>
    </div>
  )
  return (
    <div className="bg-gray-700 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-base font-bold ${biasColor(tf.bias)}`}>{biasIcon(tf.bias)} {tf.bias}</div>
      <div className="text-xs text-gray-400 mt-1">RSI {tf.rsi}</div>
      <div className="text-xs text-gray-400">{tf.macd_direction}</div>
    </div>
  )
}

// ── 主頁面 ────────────────────────────────────────────
export default function AnalyzePage() {
  const [input, setInput] = useState('AAPL\n2330.TW\nBTC')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    setError('')
    setLoading(true)
    setResults([])

    const symbols = input.split('\n').map(s => s.trim().toUpperCase()).filter(Boolean)
    if (!symbols.length) { setError('請至少輸入一個代號'); setLoading(false); return }

    const list: any[] = []
    for (const symbol of symbols) {
      try {
        const data = await fetchStockData(symbol)
        list.push({ symbol, data, err: null })
      } catch (e: any) {
        list.push({ symbol, data: null, err: e.message })
      }
    }
    setResults(list)
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 標題 */}
      <div>
        <h1 className="text-2xl font-bold mb-1">🔍 新分析</h1>
        <p className="text-gray-400 text-sm">支援美股、台股上市（.TW）、台股上櫃（.TWO）、加密貨幣</p>
      </div>

      {/* 輸入區 */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 mb-1">
          <span>🇺🇸 AAPL, NVDA, TSLA</span>
          <span>🇹🇼 2330.TW / 6547.TWO</span>
          <span>🪙 BTC, ETH, SOL</span>
        </div>
        <textarea
          className="w-full bg-gray-700 text-white rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={4}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="每行一個代號"
          disabled={loading}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
        >
          {loading ? '分析中...' : '🔍 開始分析'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner label="正在抓取市場數據..." />
        </div>
      )}

      {/* 結果 */}
      {results.map(({ symbol, data, err }) => (
        <div key={symbol} className="bg-gray-800 rounded-xl overflow-hidden">
          {/* 股票標題列 */}
          <div className="bg-gray-750 border-b border-gray-700 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">{symbol}</span>
              {data && <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{assetLabel[data.asset_type] ?? data.asset_type}</span>}
            </div>
            {data && (
              <div className="text-right">
                <div className="text-xl font-bold">{data.currency}{data.current_price}</div>
                <div className={`text-sm ${changeColor(data.change_pct)}`}>
                  {data.change_pct > 0 ? '+' : ''}{data.change_pct}%
                </div>
              </div>
            )}
          </div>

          {err ? (
            <div className="p-4 text-red-400">❌ {err}</div>
          ) : data ? (
            <div className="p-5 space-y-5">

              {/* 多時框架偏向 */}
              <div>
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">多時框架偏向</div>
                <div className="grid grid-cols-4 gap-2">
                  <TfCard label="週線" tf={data.timeframes?.weekly} />
                  <TfCard label="日線" tf={data.timeframes?.daily} />
                  <TfCard label="4H"   tf={data.timeframes?.h4} />
                  <TfCard label="1H"   tf={data.timeframes?.h1} />
                </div>
              </div>

              {/* 核心指標 */}
              <div>
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">核心指標</div>
                <div className="grid grid-cols-4 gap-2">
                  <MetricCard label="RSI(14)" value={data.rsi}
                    sub={data.rsi > 70 ? '超買' : data.rsi < 30 ? '超賣' : '中性'}
                    subColor={data.rsi > 70 ? 'text-red-400' : data.rsi < 30 ? 'text-green-400' : 'text-gray-400'} />
                  <MetricCard label="MACD Hist" value={data.macd_histogram}
                    sub={data.macd_histogram > 0 ? '金叉' : '死叉'}
                    subColor={data.macd_histogram > 0 ? 'text-green-400' : 'text-red-400'} />
                  <MetricCard label="量比" value={`${data.volume_ratio}x`}
                    sub={data.volume_ratio > 1.5 ? '放量' : data.volume_ratio < 0.7 ? '縮量' : '正常'}
                    subColor={data.volume_ratio > 1.5 ? 'text-yellow-400' : 'text-gray-400'} />
                  <MetricCard label="5日報酬" value={`${data.return_5d}%`}
                    subColor={changeColor(data.return_5d)} />
                </div>
              </div>

              {/* 均線 & 布林 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">均線</div>
                  <div className="bg-gray-700 rounded-lg p-3 space-y-1.5 text-sm">
                    {[['MA20', data.ma20, data.above_ma20], ['MA50', data.ma50, data.above_ma50],
                      data.asset_type === 'taiwan' ? ['MA60', data.ma60, data.above_ma60] : ['MA200', data.ma200, data.above_ma200]
                    ].map(([label, val, above]: any) => val ? (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-400">{label}</span>
                        <span className={above ? 'text-green-400' : 'text-red-400'}>
                          {data.currency}{val} {above ? '▲上方' : '▼下方'}
                        </span>
                      </div>
                    ) : null)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">布林通道 & ATR</div>
                  <div className="bg-gray-700 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">位置</span><span className="text-white">{data.bb_position}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">上軌</span><span>{data.currency}{data.bb_upper}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">下軌</span><span>{data.currency}{data.bb_lower}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">ATR停損</span><span className="text-orange-400">{data.currency}{data.atr_stop}</span></div>
                  </div>
                </div>
              </div>

              {/* 52週 & 其他 */}
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="52週高點" value={`${data.currency}${data.high_52w}`}
                  sub={`距離 ${data.pct_from_52w_high}%`} subColor="text-red-400" />
                <MetricCard label="52週低點" value={`${data.currency}${data.low_52w}`}
                  sub={`距離 +${data.pct_from_52w_low}%`} subColor="text-green-400" />
                <MetricCard label="RSI 背離" value={data.rsi_divergence?.includes('底背離') ? '🟢 底背離' : data.rsi_divergence?.includes('頂背離') ? '🔴 頂背離' : '無'} />
              </div>

              {/* OBV */}
              {data.obv_signal && (
                <div className="bg-gray-700 rounded-lg p-3 text-sm">
                  <span className="text-gray-400 mr-2">OBV：</span>
                  <span className="text-white">{data.obv_signal}</span>
                </div>
              )}

              {/* K線型態 */}
              {data.candlestick_patterns && (
                <div>
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">K線型態</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {([['週線', 'weekly'], ['日線', 'daily'], ['4H', 'h4']] as [string, string][]).map(([label, key]) => (
                      <div key={key} className="bg-gray-700 rounded-lg p-2">
                        <div className="text-gray-400 text-xs mb-1">{label}</div>
                        <div className="text-white text-xs">{data.candlestick_patterns[key]?.join('、') || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 財報 */}
              {data.earnings_info && (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-sm">
                  📅 下次財報：<span className="text-yellow-300">{data.earnings_info}</span>
                </div>
              )}

              {/* 新聞 */}
              {data.news?.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">近期新聞</div>
                  <div className="space-y-2">
                    {data.news.map((n: any, i: number) => (
                      <div key={i} className="bg-gray-700 rounded-lg p-3 text-sm">
                        <div className="text-white font-medium">{n.title}</div>
                        {n.summary && <div className="text-gray-400 text-xs mt-1">{n.summary}</div>}
                        {n.date && <div className="text-gray-500 text-xs mt-1">{n.date}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
