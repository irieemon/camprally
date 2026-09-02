"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search as SearchIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxIcon,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxStatus,
} from "@/components/ui/combobox"
import { useSearchIndex } from "@/lib/useSearchIndex"
import { search, tokenizeQuery, highlightSegments, type SearchResult } from "@/lib/search"
import { cn } from "@/lib/utils"

const RESULT_LIMIT = 6

/**
 * The header search control: a search icon that expands into a combobox.
 *
 * Controlled by the caller (`open`/`onOpenChange`) rather than owning its own
 * open state, because Navigation needs to react to it too: on a narrow
 * viewport there is no spare width for a standing input next to the wordmark
 * and the hamburger, so Navigation hides those while search is open and this
 * component's input takes the freed width. See Navigation.tsx.
 *
 * WHY AN ICON RATHER THAN A PERMANENTLY VISIBLE INPUT. Navigation's desktop
 * row is already six links wide and the mobile row is a logo, a promo, and a
 * hamburger; there's no free width for a standing input on either without
 * redesigning the header itself. An icon costs nothing until someone uses
 * it, which is also why the search index it drives is not fetched until the
 * icon is clicked — see useSearchIndex.
 *
 * ARIA: Base UI's Combobox implements the WAI-ARIA combobox pattern directly
 * (role="combobox" on the input, role="listbox"/"option" on the popup and its
 * items, aria-activedescendant roving highlight, Enter to choose the
 * highlighted option). This component supplies the one behavior the pattern
 * leaves to the app: what Enter does with NO option highlighted, which here
 * means "go to the full results page" rather than nothing.
 */
export default function SearchBox({
  open,
  onOpenChange,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  const router = useRouter()
  const panelOpen = open
  const setPanelOpen = onOpenChange
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState<SearchResult | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The popup portals to document.body (see ComboboxPortal), so it sits
  // outside containerRef's DOM subtree — a ref straight to the positioner
  // (which wraps the popup, its list/items, and the "See all results"
  // footer button) is what makes the outside-click check below actually
  // correct for a portaled popup, rather than relying on event-timing luck.
  const positionerRef = useRef<HTMLDivElement>(null)

  const { index } = useSearchIndex(panelOpen)

  const terms = useMemo(() => tokenizeQuery(query), [query])
  const results = useMemo<SearchResult[]>(
    () => (index ? search(index, query, { limit: RESULT_LIMIT }) : []),
    [index, query],
  )

  // Reset the tracked highlight when the query changes, during render rather
  // than in an effect — the React-recommended pattern for "adjust state when
  // a prop/derived value changes" (react.dev/learn/you-might-not-need-an-effect).
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setHighlighted(undefined)
  }

  // Autofocus the input the moment the icon opens the panel.
  useEffect(() => {
    if (!panelOpen) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [panelOpen])

  // Click outside collapses the panel back to just the icon. Must check the
  // positioner in addition to the container: ComboboxPortal renders the
  // popup into document.body, outside containerRef entirely, so a mousedown
  // on a result item would otherwise read as "outside" and close the panel
  // before Base UI's own item-selection handler (handleValueChange) runs.
  useEffect(() => {
    if (!panelOpen) return
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node
      const insideContainer = containerRef.current?.contains(target) ?? false
      const insidePositioner = positionerRef.current?.contains(target) ?? false
      if (!insideContainer && !insidePositioner) {
        setPanelOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [panelOpen, setPanelOpen])

  function closePanel() {
    setPanelOpen(false)
    setQuery("")
  }

  function goToResults(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    closePanel()
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  function handleValueChange(item: SearchResult | null) {
    if (!item) return
    closePanel()
    router.push(item.href)
  }

  if (!panelOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search guides"
        onClick={() => setPanelOpen(true)}
        className={className}
      >
        <SearchIcon className="size-5 text-foreground" />
      </Button>
    )
  }

  return (
    <div ref={containerRef} className={cn("relative w-full sm:w-64 md:w-72", className)}>
      <Combobox
        items={results}
        filteredItems={results}
        value={null}
        onValueChange={handleValueChange}
        inputValue={query}
        onInputValueChange={setQuery}
        onItemHighlighted={(item) => setHighlighted(item ?? undefined)}
        itemToStringLabel={(item: SearchResult) => item.title}
        open={query.trim().length > 0}
        onOpenChange={() => {}}
        openOnInputClick={false}
      >
        <ComboboxInputGroup>
          <ComboboxIcon>
            <SearchIcon className="size-4" />
          </ComboboxIcon>
          <ComboboxInput
            ref={inputRef}
            className="pr-9"
            placeholder="Search guides…"
            aria-label="Search guides"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                closePanel()
              } else if (e.key === "Enter" && !highlighted) {
                goToResults(query)
              }
            }}
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={closePanel}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camp-green"
          >
            <X className="size-4" />
          </button>
        </ComboboxInputGroup>
        <ComboboxPortal>
          <ComboboxPositioner ref={positionerRef} align="end" sideOffset={8}>
            <ComboboxPopup>
              <ComboboxEmpty>No guides match &ldquo;{query.trim()}&rdquo;.</ComboboxEmpty>
              <ComboboxList>
                {(item: SearchResult) => (
                  <ComboboxItem key={item.slug} value={item}>
                    <ResultRow item={item} terms={terms} />
                  </ComboboxItem>
                )}
              </ComboboxList>
              {results.length > 0 && (
                <button
                  type="button"
                  className="block w-full border-t border-camp-stone px-4 py-3 text-left text-meta font-medium text-camp-green hover:bg-camp-bone"
                  onClick={() => goToResults(query)}
                >
                  See all results for &ldquo;{query.trim()}&rdquo;
                </button>
              )}
              <ComboboxStatus />
            </ComboboxPopup>
          </ComboboxPositioner>
        </ComboboxPortal>
      </Combobox>
    </div>
  )
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  const segments = highlightSegments(text, terms)
  return (
    <>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="bg-camp-green/20 text-foreground">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

function ResultRow({ item, terms }: { item: SearchResult; terms: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow text-camp-green">{item.category}</span>
      <span className="text-[0.9375rem] font-medium text-foreground">
        <Mark text={item.title} terms={terms} />
      </span>
      <span className="line-clamp-2 text-meta text-muted-foreground">
        <Mark text={item.excerpt} terms={terms} />
      </span>
      {item.matchedHeading && (
        <span className="text-meta text-camp-green/80">In &ldquo;{item.matchedHeading.t}&rdquo;</span>
      )}
    </div>
  )
}
