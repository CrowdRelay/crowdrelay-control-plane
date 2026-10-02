import { Show, createSignal, createMemo } from 'solid-js'
import { Upload } from 'lucide-solid'
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
import { Alert } from './app/alert'
import { Pill, type Tone } from './ui/dash'
import { SkeletonRows } from './Skeleton'
import { Spinner } from './Spinner'

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
      setFileError(null)
      setValidateResult(null)
      toast.success(`Reddit cookies refreshed — ${data.cookie_count} cookies stored`)
      status.refetch()
    },
    // The failure is said once, under the drop zone, where the next try is.
    onError: (error) => {
      setFileError(failureLine("Couldn't upload the file", error))
    },
  }))

  const validate = useMutation(() => ({
    mutationFn: () => api.redditCookieValidate(props.slug),
    onSuccess: (data) => {
      setValidateResult(data)
      if (data.valid) {
        toast.success(`Cookies work — signed in as u/${data.reddit_username}`)
      } else {
        status.refetch()
      }
    },
    onError: (error) => {
      setValidateResult({ valid: false, error: failureLine("Couldn't test the cookies", error) })
    },
  }))

  const handleFile = async (file: File) => {
    setFileError(null)
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

  const statusLabel = createMemo((): { text: string; tone: Tone } => {
    const s = status.data?.status
    if (!s || s === 'missing') return { text: 'None stored', tone: 'muted' }
    if (s === 'active') return { text: 'Active', tone: 'good' }
    if (s === 'expired') return { text: 'Expired', tone: 'warn' }
    if (s === 'failed') return { text: 'Rejected', tone: 'bad' }
    return { text: s, tone: 'muted' }
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

  // One status line, one message when something needs doing, one drop zone.
  // It used to stack a status chip, a second status line, a coloured box per
  // state, a result box per action and a toast for each — five places saying
  // overlapping things. And only the button inside the dashed box opened the
  // file picker; the box itself, which looks like the target, did nothing.
  return (
    <Section
      title="Reddit session cookies"
      icon={<SectionIcon name="shield" />}
      description={<>When Reddit blocks the browser login, upload a <code>cookies.txt</code> from a signed-in Reddit session. Only <code>reddit.com</code> cookies are kept.</>}
      action={<Show when={status.data}><Pill tone={statusLabel().tone}>{statusLabel().text}</Pill></Show>}
    >
      <div class="space-y-3">
        <Show when={status.isError}>
          <ErrorCard title="Couldn't load the cookie status" error={status.error} onRetry={() => void status.refetch()} />
        </Show>
        <Show when={status.isPending}><SkeletonRows count={2} /></Show>

        <Show when={status.data?.status === 'active' || status.data?.status === 'failed'}>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="m-0 text-sm text-muted-foreground">
              <Show when={status.data?.reddit_username}>Signed in as <span class="font-medium text-foreground">u/{status.data?.reddit_username}</span> · </Show>
              {formatExpiry(status.data?.expires_at ?? null)}
            </p>
            <Button writes variant="outline" size="sm" onClick={() => validate.mutate()} disabled={validate.isPending}>
              <Show when={validate.isPending}><Spinner /></Show>
              {validate.isPending ? 'Testing…' : 'Test cookies'}
            </Button>
          </div>
        </Show>

        <Show when={validateResult() && !validateResult()!.valid} fallback={
          <>
            <Show when={status.data?.status === 'expired'}>
              <Alert tone="warning">The cookies have expired. Upload a fresh <code>cookies.txt</code> to bring the Reddit feeds back.</Alert>
            </Show>
            <Show when={status.data?.status === 'failed'}>
              <Alert tone="destructive">Reddit rejected the cookies. The account may be blocked, or the server's address flagged. Export fresh cookies from a home connection, upload them, then test them.</Alert>
            </Show>
            <Show when={status.data?.status === 'missing'}>
              <Alert tone="info">No cookies stored. Reddit feeds fail until cookies are uploaded or the browser login works.</Alert>
            </Show>
          </>
        }>
          <Alert tone="destructive">{validateResult()!.error ?? 'Reddit rejected the cookies.'} Upload fresh cookies below.</Alert>
        </Show>

        {/* The whole box is the label, so clicking anywhere in it opens the
            picker. The input is visually hidden, so the box draws the focus
            ring a keyboard user needs. */}
        <label
          class={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-6 py-6 text-center transition-colors hover:border-input hover:bg-muted/40',
            'has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
            dragOver() && 'border-primary bg-muted/40',
            (readOnly() || upload.isPending) && 'pointer-events-none opacity-60',
          )}
          title={readOnly() ? READ_ONLY_REASON : undefined}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <FileInput writes accept=".txt,text/plain" onChange={onFileInput} disabled={upload.isPending} />
          <Show when={upload.isPending} fallback={<Upload class="size-5 text-muted-foreground" aria-hidden="true" />}><Spinner /></Show>
          <span class="text-sm text-foreground">
            <Show when={upload.isPending} fallback={<>Drop <code>cookies.txt</code> here, or <span class="font-medium underline underline-offset-2">choose a file</span></>}>Uploading…</Show>
          </span>
          <span class="text-xs text-muted-foreground">Netscape format, up to 500 KB</span>
        </label>

        <Show when={fileError()}>
          <ErrorCard>{fileError()}</ErrorCard>
        </Show>
      </div>
    </Section>
  )
}
