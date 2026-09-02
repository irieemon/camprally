"use client"

import { useEffect, useState } from "react"
import type { SearchIndex } from "@/lib/search"

/**
 * Module-scope cache, shared by every component that calls the hook below.
 *
 * The index is fetched once per page load no matter how many search boxes
 * mount — the header control and, on /search, the results page both call
 * this hook, and opening search on /blog then again on a guide page should
 * cost one network request for the whole session, not one per mount.
 */
let cached: SearchIndex | null = null
let inflight: Promise<SearchIndex> | null = null

function loadIndex(): Promise<SearchIndex> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch("/search-index.json")
      .then((res) => {
        if (!res.ok) throw new Error(`search index fetch failed: ${res.status}`)
        return res.json() as Promise<SearchIndex>
      })
      .then((data) => {
        cached = data
        return data
      })
      .catch((err) => {
        // Allow a later call to retry rather than caching the failure forever.
        inflight = null
        throw err
      })
  }
  return inflight
}

export type SearchIndexStatus = "idle" | "loading" | "ready" | "error"

/**
 * Lazily fetches /search-index.json — built at build time by
 * scripts/build-search-index.mjs — the first time `enabled` is true. Never
 * imported statically into a page bundle; the index itself never ships
 * unless someone actually interacts with search.
 */
export function useSearchIndex(enabled: boolean): {
  index: SearchIndex | null
  status: SearchIndexStatus
} {
  const [index, setIndex] = useState<SearchIndex | null>(cached)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || index) return
    let cancelled = false
    loadIndex()
      .then((data) => {
        if (cancelled) return
        setIndex(data)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, index])

  // Derived rather than a separately-set "loading" state: the fetch's only
  // observable outcomes are `index` landing or `failed` flipping, and both
  // are already state. A third piece of state set synchronously at the top
  // of the effect above would just be the same information stored twice.
  const status: SearchIndexStatus = index ? "ready" : failed ? "error" : enabled ? "loading" : "idle"

  return { index, status }
}
