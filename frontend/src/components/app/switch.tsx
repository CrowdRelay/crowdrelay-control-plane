import { type Component, splitProps } from 'solid-js'
import { Switch as StockSwitch, SwitchControl, SwitchThumb } from '~/components/ui/switch'
import { READ_ONLY_REASON, readOnly } from '~/lib/read-only'

/**
 * Switch over the stock solid-ui switch, keeping the console's controlled API:
 * the caller owns the value and the mutation, `onChange` just asks to flip it.
 *
 * `writes` defaults to true — every switch in this console flips something the
 * server stores. A switch that only drives local UI state passes `writes={false}`.
 */
export type SwitchProps = {
  checked: boolean
  /** Accessible name. Required — a bare toggle reads as "switch" otherwise. */
  label: string
  onChange?: () => void
  disabled?: boolean
  title?: string
  class?: string
  writes?: boolean
}

export const Switch: Component<SwitchProps> = (props) => {
  const [local] = splitProps(props, ['checked', 'label', 'onChange', 'disabled', 'title', 'class', 'writes'])
  const blocked = () => local.writes !== false && readOnly()
  return (
    <StockSwitch
      class={local.class}
      checked={local.checked}
      disabled={blocked() || local.disabled}
      onChange={() => local.onChange?.()}
      title={blocked() ? READ_ONLY_REASON : local.title}
    >
      <SwitchControl aria-label={local.label}>
        <SwitchThumb />
      </SwitchControl>
    </StockSwitch>
  )
}
