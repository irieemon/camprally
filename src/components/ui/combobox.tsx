"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "@/lib/utils"

/**
 * Thin wrapper around Base UI's Combobox — same pattern as ui/sheet.tsx: the
 * primitive owns behavior and ARIA (combobox role, listbox popup, roving
 * highlight, Escape-to-close), this file owns the site's look.
 *
 * Deliberately square, not the shadcn "base-nova" defaults the rest of
 * src/components/ui uses (Button/Sheet round their corners). The header
 * search control sits next to ArticleCard and BlogGrid, both hairline
 * camp-stone borders with zero border-radius — see the "REI caps its radii"
 * note in globals.css. Matching that here, not the ui/ kit's own defaults,
 * is deliberate.
 */

function Combobox<Value, Multiple extends boolean | undefined = false>({
  ...props
}: ComboboxPrimitive.Root.Props<Value, Multiple>) {
  return <ComboboxPrimitive.Root data-slot="combobox" {...props} />
}

function ComboboxInputGroup({
  className,
  ...props
}: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "relative flex items-center border border-camp-stone bg-background transition-colors focus-within:border-camp-green",
        className
      )}
      {...props}
    />
  )
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-11 w-full bg-transparent pl-10 pr-4 text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxIcon({ className, ...props }: ComboboxPrimitive.Icon.Props) {
  return (
    <ComboboxPrimitive.Icon
      data-slot="combobox-icon"
      className={cn(
        "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxPortal(props: ComboboxPrimitive.Portal.Props) {
  return <ComboboxPrimitive.Portal data-slot="combobox-portal" {...props} />
}

function ComboboxPositioner({
  className,
  sideOffset = 8,
  ...props
}: ComboboxPrimitive.Positioner.Props) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      sideOffset={sideOffset}
      className={cn("z-50 outline-none", className)}
      {...props}
    />
  )
}

function ComboboxPopup({ className, ...props }: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        "w-(--anchor-width) min-w-[20rem] border border-camp-stone bg-popover bg-clip-padding text-popover-foreground shadow-lg transition duration-150 ease-out data-ending-style:opacity-0 data-ending-style:scale-98 data-starting-style:opacity-0 data-starting-style:scale-98",
        className
      )}
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-[70vh] overflow-y-auto overscroll-contain py-1", className)}
      {...props}
    />
  )
}

function ComboboxItem({ className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "cursor-pointer scroll-my-1 px-4 py-3 outline-none data-[highlighted]:bg-camp-bone",
        className
      )}
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-4 py-8 text-center text-meta text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn("sr-only", className)}
      {...props}
    />
  )
}

export {
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
}
