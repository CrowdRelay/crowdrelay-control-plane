import { Show, createSignal, createMemo } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useQuery, useMutation } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { toast } from './app/toast'
import { cn } from '../lib/cn'
import { ErrorCard, Section } from './layout'
import { Button } from './app/button'
import { SectionIcon } from './SectionIcon'
import { READ_ONLY_REASON, readOnly } from '../lib/read-only'
import { FileInput } from './ui/file-input'

/**
 * Reddit Cookie Uploader — lets an operator refresh Reddit session cookies
 * by uploading a Netscape cookies.txt file. This is the recovery path when
 * Reddit's browser login is blocked by IP fingerprinting but the account
 * itself is fine.
 *
 * Security: cookies are never displayed. The status query returns only
 * metadata (active/expired/missing + expiry). The upload sends the file
 * text to the agent service which parses and stores only Reddit-domain
 * cookies.
 */
export function RedditCookieUploader(props: { slug: string }) {
  const [fileError, setFileError] = createSignal<string | null>(null)
  const [uploadResult, setUploadResult] = createSignal<{ cookie_count: number; expires_at: string } | null>(null)
  const [dragOver, setDragOver] = createSignal(false)
  const [validateResult, setValidateResult] = createSignal<{ valid: boolean; reddit_username?: string; error?: string } | null>(null)

  const status = useQuery(() => ({
    queryKey: ['reddit-cookie-status', props.slug],
    queryFn: () => api.redditCookieStatus(props.slug),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  const upload = useMutation(() => ({
    mutationFn: async (text: string) => {
      // No account name is sent: the agent service reads it from its own
      // session probe, which is the only source that cannot be wrong.
      return api.redditCookieUpload(props.slug, { cookies_text: text })
    },
    onSuccess: (data) => {
      setUploadResult({ cookie_count: data.cookie_count, expires_at: data.expires_at })
      setFileError(null)
      setValidateResult(null)
      toast.success(`Reddit cookies refreshed — ${data.cookie_count} cookies stored`)
      status.refetch()
    },
    onError: (error) => {
      setFileError(failureLine("Couldn't upload the file", error))
      toast.error('Reddit cookie upload failed')
    },
  }))

  const validate = useMutation(() => ({
    mutationFn: () => api.redditCookieValidate(props.slug),
    onSuccess: (data) => {
      setValidateResult(data)
      if (data.valid) {
        toast.success(`Cookies valid — logged in as u/${data.reddit_username}`)
      } else {
        toast.error('Reddit rejected the cookies')
        status.refetch()
      }
    },
    onError: (error) => {
      setValidateResult({ valid: false, error: failureLine("Couldn't check the cookies", error) })
      toast.error('Could not validate cookies')
    },
  }))

  const handleFile = async (file: File) => {
    setFileError(null)
    setUploadResult(null)
    if (file.size > 500_000) {
      setFileError('File is too large (max 500KB). Export only Reddit cookies.')
      return
    }
    const text = await file.text()
    if (!text.includes('reddit.com')) {
      setFileError('No reddit.com cookies found in this file. Export cookies from a logged-in Reddit session.')
      return
    }
    upload.mutate(text)
  }

  const onFileInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
    input.value = ''
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const statusLabel = createMemo(() => {
    const s = status.data?.status
    if (!s || s === 'missing') return { text: 'No cookies stored', class: '' }
    if (s === 'active') return { text: 'Active', class: 'bg-success-foreground/10 text-success-foreground border-success-foreground/20' }
    if (s === 'expired') return { text: 'Expired', class: 'bg-warning-foreground/10 text-warning-foreground border-warning-foreground/20' }
    if (s === 'failed') return { text: 'Failed', class: 'bg-destructive/15 text-destructive border-destructive/20' }
    return { text: s, class: '' }
  })

  const formatExpiry = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    const days = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (days < 0) return `Expired ${Math.abs(days)}d ago`
    if (days === 0) return 'Expires today'
    return `Expires in ${days}d`
  }

  return (
    <Section
      title="Reddit session cookies"
      icon={<SectionIcon name="shield" />}
      description={<>Upload a Netscape <code>cookies.txt</code> file from a logged-in Reddit session. Only <code>reddit.com</code> cookies are kept. This is the recovery path when Reddit blocks the browser login.</>}
      action={<span class={cn('text-xs uppercase tracking-tight px-2.5 py-0.5 rounded-md bg-muted border border-border text-muted-foreground font-semibold', statusLabel().class)}>{statusLabel().text}</span>}
    >

      <Show when={status.data?.status === 'active'}>
        <div class="flex gap-4 items-center my-3">
          <span class="text-sm text-muted-foreground">
            <strong class="text-foreground">{formatExpiry(status.data?.expires_at ?? null)}</strong>
          </span>
          <Show when={status.data?.reddit_username}>
            <span class="text-sm text-muted-foreground">u/{status.data?.reddit_username}</span>
          </Show>
        </div>
      </Show>

      <Show when={status.data?.status === 'expired'}>
        <div class="p-4 my-3 border border-warning-foreground/30 rounded-lg bg-warning-foreground/10 text-warning-foreground leading-relaxed">
          Cookies have expired. Upload a fresh <code>cookies.txt</code> to restore Reddit feeds.
        </div>
      </Show>

      <Show when={status.data?.status === 'failed'}>
        <div class="p-4 my-3 border border-destructive/30 rounded-lg bg-destructive/10 text-destructive leading-relaxed">
          Reddit rejected the cookies (403). The account may be shadow-blocked or the datacenter IP is flagged.
          Upload fresh cookies from a residential IP, then test them.
        </div>
      </Show>

      <Show when={status.data?.status === 'missing'}>
        <div class="p-4 my-3 border border-border rounded-lg bg-background text-muted-foreground leading-relaxed">
          No Reddit cookies stored. Reddit feeds will fail until cookies are uploaded or the browser login succeeds.
        </div>
      </Show>

      <Show when={validateResult()}>
        <div class={cn(
          'p-4 my-3 border rounded-lg leading-relaxed',
          validateResult()!.valid
            ? 'border-success-foreground/30 bg-success-foreground/10 text-success-foreground'
            : 'border-destructive/30 bg-destructive/10 text-destructive',
        )}>
          <Show when={validateResult()!.valid} fallback={<span>{validateResult()!.error}</span>}>
            Cookies valid — logged in as <strong>u/{validateResult()!.reddit_username}</strong>
          </Show>
        </div>
      </Show>

      <Show when={status.data?.status === 'active' || status.data?.status === 'failed'}>
        <Button writes
          variant="outline"
          onClick={() => validate.mutate()}
          disabled={validate.isPending}
        >
          {validate.isPending ? 'Testing…' : 'Test cookies'}
        </Button>
      </Show>

      <div
        class={cn(
          'border-2 border-dashed border-border rounded-lg p-6 text-center my-3 transition-colors',
          dragOver() && 'border-primary bg-background',
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <label class={cn('cursor-pointer flex flex-col gap-2 items-center', readOnly() && 'pointer-events-none opacity-45')} title={readOnly() ? READ_ONLY_REASON : undefined}>
          <FileInput writes accept=".txt,text/plain" onChange={onFileInput} disabled={upload.isPending} />
          <span class={cn(
            'inline-block px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm cursor-pointer transition-opacity hover:opacity-85',
            upload.isPending && 'opacity-50 cursor-wait',
          )}>
            {upload.isPending ? 'Uploading…' : 'Choose cookies.txt file'}
          </span>
          <span class="text-xs text-muted-foreground">or drag and drop here</span>
        </label>
      </div>

      <Show when={uploadResult()}>
        <div class="p-4 my-3 border border-success-foreground/30 rounded-md bg-success-foreground/10 text-success-foreground leading-relaxed">
          <strong>{uploadResult()!.cookie_count}</strong> Reddit cookies stored. {formatExpiry(uploadResult()!.expires_at)}
        </div>
      </Show>

      <Show when={fileError()}>
        <ErrorCard>{fileError()}</ErrorCard>
      </Show>

      <Show when={status.isError}>
        <ErrorCard title="Couldn't load the cookie status" error={status.error} onRetry={() => void status.refetch()} />
      </Show>
    </Section>
  )
}
