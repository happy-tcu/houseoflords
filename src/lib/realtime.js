import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Subscribe to a table with a filter. Returns rows array and reload fn. */
export function useRealtime(table, filter, deps = []) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      let q = supabase.from(table).select('*')
      if (filter?.eq) for (const [k, v] of Object.entries(filter.eq)) q = q.eq(k, v)
      if (filter?.order) q = q.order(filter.order.column, { ascending: filter.order.ascending ?? true })
      const { data, error } = await q
      if (!live) return
      if (error) setError(error)
      else setRows(data || [])
    }
    load()

    const channelName = `rt:${table}:${JSON.stringify(filter || {})}:${Math.random().toString(36).slice(2)}`
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
      .subscribe()

    return () => { live = false; supabase.removeChannel(channel) }
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
