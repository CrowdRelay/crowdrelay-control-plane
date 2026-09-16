import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'
import { writeGuard } from '~/lib/read-only'

/**
 * FileInput — a `type="file"` control. Native file inputs style poorly, so
 * the default render is visually hidden inside whichever label or dropzone
 * the caller draws; `class` can bring it back on screen. `writes` carries
 * the read-only rule — an upload is a write.
 */
export type FileInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  class?: string
  /** This control changes something on the server. */
  writes?: boolean
}

export const FileInput: Component<FileInputProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'writes'])
  return (
    <input
      class={cn('sr-only', local.class)}
      {...rest}
      type="file"
      {...(local.writes ? writeGuard() : {})}
    />
  )
}
