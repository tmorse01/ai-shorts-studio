// The shared-property rules for a multi-selection (Epic 08, #99). A property is shown only when every
// selected item has it. Its value is the common value, or mixed when the items differ. No DOM, no React,
// so the rules are tested directly.

// The value of one property across the selection. mixed is true when the items disagree; value is then
// the first item's value and should not be shown.
export interface SharedValue<T> {
  value: T
  mixed: boolean
}

export type SharedProperties<T> = { [K in keyof T]: SharedValue<T[K]> }

// The properties every item has, with their shared values. Returns null when there are no items, or when
// any item lacks the properties (a null entry), so none of them can be shared.
export function sharedProperties<T extends object>(
  items: readonly (T | null)[]
): SharedProperties<T> | null {
  if (items.length === 0) return null
  const present: T[] = []
  for (const item of items) {
    if (item === null) return null
    present.push(item)
  }
  const [first] = present
  const shared = {} as SharedProperties<T>
  for (const key of Object.keys(first) as (keyof T & string)[]) {
    const mixed = present.some((item) => item[key] !== first[key])
    shared[key] = { value: first[key], mixed }
  }
  return shared
}
