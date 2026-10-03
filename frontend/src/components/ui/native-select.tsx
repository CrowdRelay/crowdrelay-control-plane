import { Show, createEffect, createSignal, createUniqueId, on, onCleanup, onMount, splitProps, type Component, type JSX } from 'solid-js'
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './select'

/**
 * NativeSelect — the console's select, drawn as shadcn's Select (ui/select.tsx)
 * while keeping the native `<select>` contract every call site was written
 * against.
 *
 * Callers still pass `<option>` / `<optgroup>` children, `value`, `name`,
 * `required`, `writeGuard()` and an `onChange` that reads
 * `event.currentTarget.value`. Underneath, the real `<select>` stays in the
 * DOM — visually hidden, out of the tab order — and stays the source of
 * truth: its options are read into the listbox (and re-read when they
 * change), picking an item sets its value and dispatches real `input` and
 * `change` events on it, and native form validation (`required`) and
 * `FormData` keep working. On screen, a Kobalte listbox: a trigger that
 * reads like an input, a popup the trigger's width, a check on the chosen
 * item, full keyboard support and typeahead.
 *
 * The trigger comes first in the DOM, so a wrapping `<label>` (Field) names
 * and activates it, and it takes the caller's `id` and `aria-*` props.
 */

export type NativeSelectProps = JSX.SelectHTMLAttributes<HTMLSelectElement> & {
  class?: string
  size?: 'sm' | 'default'
}

type Opt = { value: string; label: string; disabled: boolean }
type Group = { label: string; options: Opt[] }

const toOpt = (o: HTMLOptionElement): Opt => ({ value: o.value, label: o.label || o.text, disabled: o.disabled })

export const NativeSelect: Component<NativeSelectProps> = (props) => {
  const [local, trigger, rest] = splitProps(
    props,
    ['class', 'size', 'children'],
    ['id', 'aria-label', 'aria-labelledby', 'aria-describedby', 'title', 'autofocus'],
  )
  let select!: HTMLSelectElement
  let button: HTMLButtonElement | undefined
  const [groups, setGroups] = createSignal<Group[]>([])
  const [current, setCurrent] = createSignal<string | null>(null)
  const [disabled, setDisabled] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [open, setOpen] = createSignal(false)
  const [labelledBy, setLabelledBy] = createSignal<string | undefined>()

  // Read the native select into the listbox: options, groups, selection.
  const read = () => {
    const out: Group[] = []
    let loose: Group | null = null
    for (const node of Array.from(select.children)) {
      if (node instanceof HTMLOptGroupElement) {
        out.push({ label: node.label, options: Array.from(node.querySelectorAll('option')).map(toOpt) })
        loose = null
      } else if (node instanceof HTMLOptionElement) {
        if (!loose) out.push((loose = { label: '', options: [] }))
        loose.options.push(toOpt(node))
      }
    }
    setGroups(out)
    setCurrent(select.selectedIndex >= 0 ? select.value : null)
    setDisabled(select.disabled)
  }

  onMount(() => {
    read()
    // <For>-rendered options arrive and change after mount; writeGuard flips
    // `disabled`. Both show up as DOM mutations on the native select.
    const observer = new MutationObserver(read)
    observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true })
    const onInvalid = () => { setInvalid(true); button?.focus() }
    select.addEventListener('invalid', onInvalid)
    select.form?.addEventListener('reset', () => queueMicrotask(read))
    onCleanup(() => { observer.disconnect(); select.removeEventListener('invalid', onInvalid) })

    // The field's label: a wrapping <label> (Field) or <label for={id}>
    // (SettingsRow). Kobalte names the trigger by its value alone, so point
    // aria-labelledby at the label's name too — "Channel, Instagram", not
    // "Instagram". A click on the label opens the list: Kobalte opens on
    // pointerdown, and a label only forwards a synthetic click.
    const wrap = button?.closest('label') ?? null
    const byFor = trigger.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(trigger.id)}"]`) : null
    const label = byFor ?? wrap
    if (!label || !button) return
    const first = label.firstElementChild
    const nameEl = label === wrap && first instanceof HTMLElement && !first.contains(button) ? first : label
    if (!nameEl.id) nameEl.id = createUniqueId()
    if (!trigger['aria-label'] && !trigger['aria-labelledby']) setLabelledBy(nameEl.id)
    const onLabelClick = (event: MouseEvent) => {
      if (!button || button.contains(event.target as Node) || disabled()) return
      event.preventDefault()
      button.focus()
      setOpen(true)
    }
    label.addEventListener('click', onLabelClick)
    onCleanup(() => label.removeEventListener('click', onLabelClick))
  })
  // A controlled `value` is written to the native select as a property, which
  // no observer sees; re-read once Solid has applied it.
  createEffect(on(() => props.value, () => queueMicrotask(read), { defer: true }))

  // `<option value="" disabled>Choose…</option>` is a placeholder, not a
  // choice: it names the empty trigger and stays out of the list.
  const isPlaceholder = (o: Opt) => o.value === '' && o.disabled
  const listed = () => groups().map(g => ({ ...g, options: g.options.filter(o => !isPlaceholder(o)) })).filter(g => g.options.length)
  const grouped = () => listed().some(g => g.label)
  const flat = () => listed().flatMap(g => g.options)
  const selected = () => flat().find(o => o.value === current()) ?? null
  const placeholder = () => groups().flatMap(g => g.options).find(isPlaceholder)?.label ?? 'Select…'

  const commit = (value: string) => {
    if (value === select.value) return
    select.value = value
    setCurrent(value)
    setInvalid(false)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return (
    <>
      <Select<Opt, Group>
        options={(grouped() ? listed() : flat()) as never}
        optionValue="value"
        optionTextValue="label"
        optionDisabled="disabled"
        optionGroupChildren={grouped() ? 'options' : undefined}
        value={selected()}
        onChange={(opt: Opt | null) => { if (opt) commit(opt.value) }}
        open={open()}
        onOpenChange={setOpen}
        disallowEmptySelection
        placeholder={placeholder()}
        disabled={disabled()}
        validationState={invalid() ? 'invalid' : undefined}
        sameWidth
        gutter={4}
        itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue.label}</SelectItem>}
        sectionComponent={(p) => (
          <Show when={(p.section.rawValue as Group).label}>
            <SelectLabel>{(p.section.rawValue as Group).label}</SelectLabel>
          </Show>
        )}
      >
        <SelectTrigger<"button"> ref={(el: HTMLButtonElement) => (button = el)} size={local.size} class={local.class} {...trigger} aria-labelledby={trigger['aria-labelledby'] ?? labelledBy()}>
          <SelectValue<Opt> class="data-[placeholder-shown]:text-muted-foreground">{state => state.selectedOption()?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent />
      </Select>
      <select ref={select} {...rest} class="sr-only" tabIndex={-1} aria-hidden="true">
        {local.children}
      </select>
    </>
  )
}

/** The same component under the name new code should use. */
export const SelectField = NativeSelect
