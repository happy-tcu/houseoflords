import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Subscribe to a table with a filter. Returns rows array + reload fn.
 *  Auto-reloads on window focus, network reconnect, and channel errors.
 */
export function useRealtime(table, filter, deps = []) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    let channel = null
    let reconnectTimer = null

    async function load() {
      let q = supabase.from(table).select('*')
      if (filter?.eq) for (const [k, v] of Object.entries(filter.eq)) q = q.eq(k, v)
      if (filter?.order) q = q.order(filter.order.column, { ascending: filter.order.ascending ?? true })
      const { data, error } = await q
      if (!live) return
      if (error) setError(error)
      else setRows(data || [])
    }

    function subscribe() {
      if (!live) return
      const channelName = `rt:${table}:${JSON.stringify(filter || {})}:${Math.random().toString(36).slice(2)}`
      channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
        .subscribe((status) => {
          if (!live) return
          // Reconnect on any non-connected state.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (channel) { supabase.removeChannel(channel); channel = null }
            clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(() => {
              if (!live) return
              load()          // fetch fresh state
              subscribe()     // re-open channel
            }, 1500)
          }
        })
    }

    load()
    subscribe()

    // Reload on focus + network reconnect — cheap safety net for flaky wifi.
    function onFocus() { if (live) load() }
    function onOnline() {
      if (!live) return
      load()
      if (channel) { supabase.removeChannel(channel); channel = null }
      subscribe()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      live = false
      clearTimeout(reconnectTimer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { rows, error, reload: () => setRows(prev => prev) }
}

/** Ticking clock at 1Hz — used to re-render timer displays. */
export function useTick(intervalMs = 500) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}

/** Track connection state — offline / degraded (realtime dropped) / online. */
export function useConnection() {
  const [state, setState] = useState({ online: navigator.onLine, realtime: 'connecting' })

  useEffect(() => {
    function onOnline() { setState(s => ({ ...s, online: true })) }
    function onOffline() { setState(s => ({ ...s, online: false })) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Ping supabase realtime channel to detect degraded state.
    const ch = supabase.channel(`__health:${Math.random().toString(36).slice(2)}`)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setState(s => ({ ...s, realtime: 'ok' }))
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setState(s => ({ ...s, realtime: 'lost' }))
        }
      })

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      supabase.removeChannel(ch)
    }
  }, [])

  return state
}

/** Proactively refresh Supabase session on window focus + every 20 minutes.
 *  Belt-and-braces on top of SDK's autoRefreshToken.
 */
export function useAuthRefresh() {
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      if (cancelled) return
      try { await supabase.auth.refreshSession() } catch { /* noop */ }
    }
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    const id = setInterval(refresh, 20 * 60 * 1000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
  }, [])
}
