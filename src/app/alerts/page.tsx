'use client'

import { useState, useEffect } from 'react'
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { fetchAlerts, addAlert, removeAlert, checkAlerts } from '@/lib/api'

interface Alert {
  symbol: string
  asset_type: string
  alert_type: string
  price: number
  note: string
  created_at: string
  triggered: boolean
  triggered_at: string | null
}

export default function AlertsPage() {
  // ── 狀態 ──────────────────────────────────────────
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [errorAlerts, setErrorAlerts] = useState('')

  // 新增警示
  const [newSymbol, setNewSymbol] = useState('')
  const [newAlertType, setNewAlertType] = useState('above')
  const [newPrice, setNewPrice] = useState('')
  const [newNote, setNewNote] = useState('')
  const [addingAlert, setAddingAlert] = useState(false)
  const [addError, setAddError] = useState('')

  // 檢查警示
  const [checkingAlerts, setCheckingAlerts] = useState(false)
  const [triggeredAlerts, setTriggeredAlerts] = useState<Alert[]>([])
  const [checkError, setCheckError] = useState('')

  // 展開/折疊
  const [expandTriggered, setExpandTriggered] = useState(false)

  // 刪除中
  const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null)
  const [deletingPrice, setDeletingPrice] = useState<number | null>(null)

  // ── 初始載入 ──────────────────────────────────────────
  useEffect(() => {
    loadAlerts()
  }, [])

  // ── 載入警示清單 ──────────────────────────────────────────
  const loadAlerts = async () => {
    try {
      setLoadingAlerts(true)
      setErrorAlerts('')
      const data = await fetchAlerts()
      setAlerts(data || [])
    } catch (err) {
      setErrorAlerts('無法載入警示清單')
      console.error(err)
    } finally {
      setLoadingAlerts(false)
    }
  }

  // ── 新增警示 ──────────────────────────────────────────
  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')

    if (!newSymbol.trim()) {
      setAddError('請輸入代號')
      return
    }

    if (!newPrice) {
      setAddError('請輸入目標價')
      return
    }

    try {
      setAddingAlert(true)
      const result = await addAlert(newSymbol.toUpperCase(), newAlertType, parseFloat(newPrice), newNote)

      if (result.success) {
        setNewSymbol('')
        setNewAlertType('above')
        setNewPrice('')
        setNewNote('')
        await loadAlerts()
      } else {
        setAddError(result.message || '新增失敗')
      }
    } catch (err) {
      setAddError('新增警示失敗')
      console.error(err)
    } finally {
      setAddingAlert(false)
    }
  }

  // ── 檢查警示 ──────────────────────────────────────────
  const handleCheckAlerts = async () => {
    try {
      setCheckingAlerts(true)
      setCheckError('')
      setTriggeredAlerts([])

      const result = await checkAlerts()
      if (result.triggered && result.triggered.length > 0) {
        setTriggeredAlerts(result.triggered)
      }

      // 重新載入警示清單
      await loadAlerts()
    } catch (err) {
      setCheckError('檢查警示失敗')
      console.error(err)
    } finally {
      setCheckingAlerts(false)
    }
  }

  // ── 刪除警示 ──────────────────────────────────────────
  const handleDeleteAlert = async (symbol: string, price: number) => {
    try {
      setDeletingSymbol(symbol)
      setDeletingPrice(price)

      const result = await removeAlert(symbol, price)
      if (result.success) {
        await loadAlerts()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingSymbol(null)
      setDeletingPrice(null)
    }
  }

  // ── 格式化日期 ──────────────────────────────────────────
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  // ── 取得資產類型 badge ──────────────────────────────────────────
  const getAssetBadge = (assetType: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      us: { bg: 'bg-blue-900', text: 'text-blue-300', label: '美股' },
      taiwan: { bg: 'bg-green-900', text: 'text-green-300', label: '台股' },
      crypto: { bg: 'bg-orange-900', text: 'text-orange-300', label: '加密' },
    }

    return badges[assetType] || badges['us']!
  }

  // ── 取得警示類型圖標 ──────────────────────────────────────────
  const getAlertTypeIcon = (alertType: string) => {
    return alertType === 'above' ? '⬆️' : '⬇️'
  }

  // ── 計算統計 ──────────────────────────────────────────
  const pendingCount = alerts.filter((a) => !a.triggered).length
  const triggeredCount = alerts.filter((a) => a.triggered).length

  // ── UI ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="text-3xl font-bold mb-2">🔔 價格警示</h1>
        <p className="text-gray-400">設定和管理股票、加密貨幣的價格警示</p>
      </div>

      {/* ━━━━━━━━━━━━ 新增警示 ━━━━━━━━━━━━ */}
      <Card>
        <CardHeader>
          <CardTitle>➕ 新增警示</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddAlert} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 代號 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  代號
                </label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="如 AAPL, 2330.TW, BTC"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 警示類型 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  警示類型
                </label>
                <select
                  value={newAlertType}
                  onChange={(e) => setNewAlertType(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="above">⬆️ 突破上限（高於目標價）</option>
                  <option value="below">⬇️ 跌破下限（低於目標價）</option>
                </select>
              </div>

              {/* 目標價 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  目標價 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 備注 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  備注（選填）
                </label>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="備注內容"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 錯誤提示 */}
            {addError && (
              <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-200">
                {addError}
              </div>
            )}

            {/* 新增按鈕 */}
            <Button type="submit" isLoading={addingAlert} className="w-full">
              ✅ 新增警示
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ━━━━━━━━━━━━ 即時檢查 ━━━━━━━━━━━━ */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 即時檢查</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleCheckAlerts}
            isLoading={checkingAlerts}
            className="w-full"
            variant="primary"
          >
            🔍 立即檢查所有警示
          </Button>

          {checkError && (
            <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-200">
              {checkError}
            </div>
          )}

          {/* 觸發的警示 */}
          {triggeredAlerts.length > 0 ? (
            <div className="space-y-2">
              {triggeredAlerts.map((alert) => (
                <div
                  key={`${alert.symbol}-${alert.price}`}
                  className="p-4 bg-red-900 border border-red-600 rounded-lg text-red-200"
                >
                  🚨 <strong>{alert.symbol}</strong> 警示觸發！目標價{' '}
                  <strong>{alert.price.toFixed(2)}</strong>
                  {alert.triggered_at && (
                    <div className="text-xs mt-2 opacity-80">
                      觸發時間：{formatDate(alert.triggered_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !checkingAlerts && (
              <div className="p-3 bg-green-900 border border-green-700 rounded-lg text-green-200">
                ✅ 所有警示正常
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* ━━━━━━━━━━━━ 載入中或錯誤 ━━━━━━━━━━━━ */}
      {loadingAlerts ? (
        <Card>
          <CardContent className="py-12">
            <Spinner label="載入警示中..." />
          </CardContent>
        </Card>
      ) : errorAlerts ? (
        <Card>
          <CardContent>
            <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-200">
              {errorAlerts}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ━━━━━━━━━━━━ 待觸發警示 ━━━━━━━━━━━━ */}
          <Card>
            <CardHeader>
              <CardTitle>⏰ 待觸發警示（{pendingCount} 筆）</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingCount === 0 ? (
                <p className="text-gray-400">目前無待觸發警示</p>
              ) : (
                <div className="space-y-3">
                  {alerts
                    .filter((a) => !a.triggered)
                    .map((alert) => {
                      const badge = getAssetBadge(alert.asset_type)
                      return (
                        <div
                          key={`${alert.symbol}-${alert.price}`}
                          className="p-4 border border-gray-700 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* 左側內容 */}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* 資產類型 badge */}
                                <span
                                  className={`inline-block px-2 py-1 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}
                                >
                                  {badge.label}
                                </span>

                                {/* 代號 */}
                                <span className="text-lg font-bold text-white">
                                  {alert.symbol}
                                </span>

                                {/* 警示類型 */}
                                <span className="text-xl">{getAlertTypeIcon(alert.alert_type)}</span>

                                {/* 目標價 */}
                                <span className="text-white font-bold">
                                  {alert.price.toFixed(2)}
                                </span>
                              </div>

                              {/* 備注 */}
                              {alert.note && (
                                <p className="text-sm text-gray-300">
                                  💬 {alert.note}
                                </p>
                              )}

                              {/* 建立時間 */}
                              <p className="text-xs text-gray-500">
                                建立：{formatDate(alert.created_at)}
                              </p>
                            </div>

                            {/* 刪除按鈕 */}
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteAlert(alert.symbol, alert.price)}
                              isLoading={
                                deletingSymbol === alert.symbol && deletingPrice === alert.price
                              }
                              className="whitespace-nowrap"
                            >
                              🗑️
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ━━━━━━━━━━━━ 已觸發警示（可折疊） ━━━━━━━━━━━━ */}
          {triggeredCount > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer hover:bg-gray-700 -m-6 p-6 rounded-t-lg transition"
                onClick={() => setExpandTriggered(!expandTriggered)}
              >
                <CardTitle>
                  {expandTriggered ? '▼' : '▶'} ✅ 已觸發警示（{triggeredCount} 筆）
                </CardTitle>
              </CardHeader>

              {expandTriggered && (
                <CardContent className="border-t border-gray-700">
                  <div className="space-y-3 mt-4">
                    {alerts
                      .filter((a) => a.triggered)
                      .map((alert) => {
                        const badge = getAssetBadge(alert.asset_type)
                        return (
                          <div
                            key={`${alert.symbol}-${alert.price}`}
                            className="p-4 border border-gray-700 rounded-lg bg-gray-700 opacity-60 hover:opacity-80 transition"
                          >
                            <div className="flex items-start justify-between gap-4">
                              {/* 左側內容 */}
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* 資產類型 badge */}
                                  <span
                                    className={`inline-block px-2 py-1 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}
                                  >
                                    {badge.label}
                                  </span>

                                  {/* 代號 */}
                                  <span className="text-lg font-bold text-white">
                                    {alert.symbol}
                                  </span>

                                  {/* 警示類型 */}
                                  <span className="text-xl">
                                    {getAlertTypeIcon(alert.alert_type)}
                                  </span>

                                  {/* 目標價 */}
                                  <span className="text-white font-bold">
                                    {alert.price.toFixed(2)}
                                  </span>
                                </div>

                                {/* 備注 */}
                                {alert.note && (
                                  <p className="text-sm text-gray-300">
                                    💬 {alert.note}
                                  </p>
                                )}

                                {/* 建立時間 */}
                                <p className="text-xs text-gray-500">
                                  建立：{formatDate(alert.created_at)}
                                </p>

                                {/* 觸發時間 */}
                                {alert.triggered_at && (
                                  <p className="text-xs text-gray-500">
                                    觸發：{formatDate(alert.triggered_at)}
                                  </p>
                                )}
                              </div>

                              {/* 刪除按鈕 */}
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteAlert(alert.symbol, alert.price)}
                                isLoading={
                                  deletingSymbol === alert.symbol &&
                                  deletingPrice === alert.price
                                }
                                className="whitespace-nowrap"
                              >
                                🗑️
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
