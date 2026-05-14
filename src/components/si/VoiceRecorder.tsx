import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Spinner } from '../Spinner'

// Per CAPACITOR8-COMPAT.md verdict: prefer @capacitor-community/voice-recorder
// on native (returns AAC/m4a base64). Fall back to MediaRecorder on web. The
// native plugin import is dynamic so the web bundle does not pull it in.
//
// 2-min hard cap (D-09). Output: Blob (audio/m4a on native, audio/webm on web).

type State = 'idle' | 'recording' | 'playback'

const MAX_SECONDS = 120 // 2:00 cap

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export interface VoiceRecorderProps {
  onRecorded: (blob: Blob | null) => void
  existingBlob?: Blob | null
}

export function VoiceRecorder({ onRecorded, existingBlob }: VoiceRecorderProps) {
  const [state, setState] = useState<State>(existingBlob ? 'playback' : 'idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(existingBlob ?? null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  // Refs
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nativeRecRef = useRef<any>(null)

  const useNative = Capacitor.isNativePlatform()

  // Manage playback URL lifecycle
  useEffect(() => {
    if (!blob) {
      setPlaybackUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setPlaybackUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const finishRecording = useCallback(async () => {
    stopTick()
    setBusy(true)
    try {
      if (useNative && nativeRecRef.current) {
        const VR = nativeRecRef.current
        const res = await VR.stopRecording()
        const value = res?.value
        if (value?.recordDataBase64) {
          const mime = value.mimeType || 'audio/m4a'
          const out = base64ToBlob(value.recordDataBase64, mime)
          setBlob(out)
          onRecorded(out)
        } else {
          setError('錄音失敗，請重試')
          onRecorded(null)
        }
        nativeRecRef.current = null
      } else if (mediaRecRef.current) {
        const rec = mediaRecRef.current
        // Wait for the stop event so chunks are flushed.
        await new Promise<void>(resolve => {
          rec.addEventListener('stop', () => resolve(), { once: true })
          if (rec.state !== 'inactive') rec.stop()
          else resolve()
        })
        const out = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        // Stop tracks
        rec.stream.getTracks().forEach(t => t.stop())
        mediaRecRef.current = null
        if (out.size === 0) {
          setError('未錄到聲音，請重試')
          onRecorded(null)
        } else {
          setBlob(out)
          onRecorded(out)
        }
      }
      setState('playback')
    } catch (e: any) {
      console.error('VoiceRecorder finish error:', e)
      setError(e?.message ?? '錄音失敗')
      onRecorded(null)
      setState('idle')
    } finally {
      setBusy(false)
    }
  }, [onRecorded, stopTick, useNative])

  const startRecording = useCallback(async () => {
    setError(null)
    setBusy(true)
    setSeconds(0)
    try {
      if (useNative) {
        const mod = await import('capacitor-voice-recorder').catch(() => null)
        if (!mod) throw new Error('原生錄音模組不可用')
        const VR: any = (mod as any).VoiceRecorder
        const can = await VR.canDeviceVoiceRecord()
        if (!can?.value) throw new Error('裝置不支援錄音')
        const perm = await VR.hasAudioRecordingPermission()
        if (!perm?.value) {
          const req = await VR.requestAudioRecordingPermission()
          if (!req?.value) throw new Error('麥克風權限被拒')
        }
        await VR.startRecording()
        nativeRecRef.current = VR
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('瀏覽器不支援錄音')
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // audio/m4a is not universally supported in browsers; webm is the
        // safest fallback. Server can transcode later if needed.
        const mime = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
        const rec = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream)
        chunksRef.current = []
        rec.addEventListener('dataavailable', e => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        })
        rec.start()
        mediaRecRef.current = rec
      }
      setState('recording')
      const startedAt = Date.now()
      tickRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000)
        setSeconds(s)
        if (s >= MAX_SECONDS) {
          // Auto-stop at 2:00
          void finishRecording()
        }
      }, 250)
    } catch (e: any) {
      console.error('VoiceRecorder start error:', e)
      setError(e?.message ?? '無法開始錄音')
      setState('idle')
    } finally {
      setBusy(false)
    }
  }, [finishRecording, useNative])

  const togglePlayback = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      void a.play()
      setPlaying(true)
    }
  }, [playing])

  const reset = useCallback(() => {
    setBlob(null)
    setSeconds(0)
    setError(null)
    setPlaying(false)
    setState('idle')
    onRecorded(null)
  }, [onRecorded])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTick()
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stream.getTracks().forEach(t => t.stop())
        try { mediaRecRef.current.stop() } catch { /* noop */ }
      }
    }
  }, [stopTick])

  return (
    <div className="card p-3">
      <p className="label mb-2">語音備忘 (選填)</p>

      {state === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          disabled={busy}
          className="btn-ghost w-full inline-flex items-center justify-center gap-2"
        >
          {busy ? <Spinner size={16} /> : <Mic size={18} className="text-safety-600" />}
          <span>{'錄製語音備忘 (選填)'}</span>
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-base text-site-900">
              {formatMmSs(seconds)} / 2:00
            </span>
          </div>
          <button
            type="button"
            onClick={finishRecording}
            disabled={busy}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Square size={16} />
            <span>停止</span>
          </button>
        </div>
      )}

      {state === 'playback' && playbackUrl && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="btn-ghost inline-flex items-center gap-2"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
            <span>{playing ? '暫停' : '播放'}</span>
          </button>
          <audio
            ref={audioRef}
            src={playbackUrl}
            onEnded={() => setPlaying(false)}
            preload="metadata"
            className="hidden"
          />
          <button
            type="button"
            onClick={reset}
            className="text-red-600 inline-flex items-center gap-1 text-sm"
          >
            <Trash2 size={14} />
            <span>重錄</span>
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
    </div>
  )
}

export default VoiceRecorder
