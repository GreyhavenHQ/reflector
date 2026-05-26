import { useCallback, useEffect, useState } from 'react'

export type AudioDevice = { deviceId: string; label: string }
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'prompt'

/**
 * Microphone permission + input-device enumeration.
 * Mirrors www/useAudioDevice.ts with a lightweight API surface:
 *   const { permission, devices, request, getStream } = useAudioDevices()
 */
export function useAudioDevices() {
  const [permission, setPermission] = useState<PermissionState>('unknown')
  const [devices, setDevices] = useState<AudioDevice[]>([])

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all
        .filter(
          (d) => d.kind === 'audioinput' && d.deviceId !== '' && d.label !== '',
        )
        .map((d) => ({ deviceId: d.deviceId, label: d.label }))
      setDevices(inputs)
    } catch {
      setDevices([])
    }
  }, [])

  // Query the permission status on mount. Firefox doesn't support the
  // Permissions API for "microphone", so we fall back to probing getUserMedia.
  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      const isFirefox = navigator.userAgent.includes('Firefox')
      if (!isFirefox && typeof navigator.permissions?.query === 'function') {
        try {
          const status = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          })
          if (cancelled) return
          setPermission(status.state as PermissionState)
          status.onchange = () => setPermission(status.state as PermissionState)
          if (status.state === 'granted') await refresh()
          return
        } catch {
          // fall through to probe
        }
      }
      // Probe via getUserMedia (Firefox path)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
        if (cancelled) return
        setPermission('granted')
        await refresh()
      } catch {
        if (!cancelled) setPermission('prompt')
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const request = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Immediately stop — we'll open a real stream with the chosen device below.
      stream.getTracks().forEach((t) => t.stop())
      setPermission('granted')
      await refresh()
      return true
    } catch {
      setPermission('denied')
      return false
    }
  }, [refresh])

  const getStream = useCallback(async (deviceId?: string) => {
    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
    }
    return await navigator.mediaDevices.getUserMedia(constraints)
  }, [])

  return { permission, devices, refresh, request, getStream }
}
