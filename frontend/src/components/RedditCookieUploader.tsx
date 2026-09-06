import { Show, createSignal, createMemo } from 'solid-js'
import { useQuery, useMutation } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { toast } from '../lib/toast'

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
  const [username, setUsername] = createSignal('')

  const status = useQuery(() => ({
    queryKey: ['reddit-cookie-status', props.slug],
    queryFn: () => api.redditCookieStatus(props.slug),
    staleTime: 30_000,
  }))

  const upload = useMutation(() => ({
    mutationFn: async (text: string) => {
      return api.redditCookieUpload(props.slug, {
        cookies_text: text,
        reddit_username: username().trim() || undefined,
      })
    },
    onSuccess: (data) => {
      setUploadResult({ cookie_count: data.cookie_count, expires_at: data.expires_at })
      setFileError(null)
      toast.success(`Reddit cookies refreshed — ${data.cookie_count} cookies stored`)
      status.refetch()
    },
    onError: (error) => {
      setFileError(errorMessage(error, 'Upload failed'))
      toast.error('Reddit cookie upload failed')
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
    if (!s || s === 'missing') return { text: 'No cookies stored', class: 'badge-neutral' }
    if (s === 'active') return { text: 'Active', class: 'badge-good' }
    if (s === 'expired') return { text: 'Expired', class: 'badge-warn' }
    if (s === 'failed') return { text: 'Failed', class: 'badge-bad' }
    return { text: s, class: 'badge-neutral' }
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
    <div class="agent-section">
      <div class="agent-section-head">
        <h3>Reddit Session Cookies</h3>
        <span class={`status-badge ${statusLabel().class}`}>{statusLabel().text}</span>
      </div>
      <p class="agent-section-intro">
        Upload a Netscape <code>cookies.txt</code> file from a logged-in Reddit session.
        Only <code>reddit.com</code> cookies are extracted — other domains are ignored.
        This is the recovery path when Reddit blocks the browser login.
      </p>

      <Show when={status.data?.status === 'active'}>
        <div class="cookie-status-row">
          <span class="cookie-meta">
            <strong>{formatExpiry(status.data?.expires_at ?? null)}</strong>
          </span>
          <Show when={status.data?.reddit_username}>
            <span class="cookie-meta">u/{status.data?.reddit_username}</span>
          </Show>
        </div>
      </Show>

      <Show when={status.data?.status === 'expired'}>
        <div class="notice warn">
          Cookies have expired. Upload a fresh <code>cookies.txt</code> to restore Reddit feeds.
        </div>
      </Show>

      <Show when={status.data?.status === 'missing'}>
        <div class="notice">
          No Reddit cookies stored. Reddit feeds will fail until cookies are uploaded or the browser login succeeds.
        </div>
      </Show>

      <div
        class={`cookie-drop-zone ${dragOver() ? 'drag-over' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <label class="cookie-file-label">
          <input type="file" accept=".txt,text/plain" onChange={onFileInput} disabled={upload.isPending} />
          <span class="cookie-file-button">
            {upload.isPending ? 'Uploading…' : 'Choose cookies.txt file'}
          </span>
          <span class="cookie-drop-hint">or drag and drop here</span>
        </label>
      </div>

      <Show when={uploadResult()}>
        <div class="notice good">
          <strong>{uploadResult()!.cookie_count}</strong> Reddit cookies stored. {formatExpiry(uploadResult()!.expires_at)}
        </div>
      </Show>

      <Show when={fileError()}>
        <div class="error-card">{fileError()}</div>
      </Show>

      <Show when={status.isError}>
        <div class="error-card">Could not load cookie status: {errorMessage(status.error, 'unknown error')}</div>
      </Show>
    </div>
  )
}
