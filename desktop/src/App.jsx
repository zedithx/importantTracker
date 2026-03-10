import { useCallback, useEffect, useMemo, useState } from 'react'

const BACKEND_URL = 'http://localhost:8080'
const BACKEND_DOWN_HINT = `Cannot reach backend at ${BACKEND_URL}. Start it with: cd backend && go run ./cmd/server`

function getRawBase64(dataUrl) {
  if (!dataUrl) {
    return ''
  }
  const parts = dataUrl.split(',')
  if (parts.length < 2) {
    return dataUrl
  }
  return parts[1]
}

function getOrCreateUserID() {
  const key = 'snaprecall.user_id'
  const existing = window.localStorage.getItem(key)
  if (existing && existing.trim()) {
    return existing.trim()
  }

  const generated = `u_${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(key, generated)
  return generated
}

function formatFetchError(err) {
  const message = String(err?.message || err || '')
  if (message.toLowerCase().includes('failed to fetch')) {
    return BACKEND_DOWN_HINT
  }
  return message || 'Request failed.'
}

function App() {
  const [userID] = useState(getOrCreateUserID)
  const [question, setQuestion] = useState('')
  const [captureResult, setCaptureResult] = useState(null)
  const [queryResult, setQueryResult] = useState(null)
  const [imageDataURL, setImageDataURL] = useState('')
  const [status, setStatus] = useState('Ready')
  const [isSavingCapture, setIsSavingCapture] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [isUpdatingShortcut, setIsUpdatingShortcut] = useState(false)
  const [isStartingTelegramLink, setIsStartingTelegramLink] = useState(false)
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+S')
  const [shortcutDraft, setShortcutDraft] = useState('CommandOrControl+Shift+S')
  const [botUsername, setBotUsername] = useState('')
  const [telegramEventID, setTelegramEventID] = useState('')
  const [telegramLinkStatus, setTelegramLinkStatus] = useState('not_linked')

  const hasElectronAPI = useMemo(
    () => Boolean(window.electronAPI && window.electronAPI.captureScreen),
    []
  )

  const captureAndSave = useCallback(async () => {
    if (!hasElectronAPI) {
      setStatus('Capture only works inside Electron runtime.')
      return
    }

    try {
      setIsSavingCapture(true)
      setStatus('Capturing screen...')

      const dataUrl = await window.electronAPI.captureScreen()
      setImageDataURL(dataUrl)

      const payload = {
        user_id: userID,
        ocr_text: '',
        image_base64: getRawBase64(dataUrl),
        tag_hint: '',
        source_app: 'desktop',
        source_title: 'Quick Capture'
      }

      setStatus('Saving capture...')
      const res = await fetch(`${BACKEND_URL}/v1/captures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Capture failed: ${data.error || 'unknown error'}`)
        return
      }

      setCaptureResult(data)
      setStatus('Capture saved successfully.')
    } catch (err) {
      setStatus(`Capture failed: ${formatFetchError(err)}`)
    } finally {
      setIsSavingCapture(false)
    }
  }, [hasElectronAPI, userID])

  useEffect(() => {
    let unsubscribe = () => {}

    async function init() {
      if (!hasElectronAPI) {
        return
      }

      try {
        const appInfo = await window.electronAPI.getAppInfo()
        if (appInfo?.captureShortcut) {
          setShortcut(appInfo.captureShortcut)
          setShortcutDraft(appInfo.captureShortcut)
        }
      } catch {
        setStatus('Could not load shortcut info.')
      }

      const unbindCapture = window.electronAPI.onCaptureShortcut(async () => {
        setStatus('Shortcut triggered.')
        await captureAndSave()
      })

      const unbindShortcutUpdated = window.electronAPI.onShortcutUpdated((payload) => {
        if (payload?.shortcut) {
          setShortcut(payload.shortcut)
          setShortcutDraft(payload.shortcut)
        }
      })

      unsubscribe = () => {
        unbindCapture()
        unbindShortcutUpdated()
      }
    }

    init()

    return () => {
      unsubscribe()
    }
  }, [captureAndSave, hasElectronAPI])

  useEffect(() => {
    if (!telegramEventID || telegramLinkStatus !== 'pending') {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/v1/integrations/telegram/status?event_id=${encodeURIComponent(telegramEventID)}`
        )
        if (!res.ok) {
          return
        }

        const data = await res.json()
        if (data?.status) {
          setTelegramLinkStatus(data.status)
          if (data.status === 'linked') {
            setStatus('Telegram linked successfully.')
          }
        }
      } catch {
        // Keep polling silently while pending.
      }
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [telegramEventID, telegramLinkStatus])

  async function onSaveShortcut() {
    if (!hasElectronAPI || !window.electronAPI?.updateCaptureShortcut) {
      setStatus('Shortcut update only works inside Electron runtime.')
      return
    }

    const next = shortcutDraft.trim()
    if (!next) {
      setStatus('Shortcut cannot be empty.')
      return
    }

    try {
      setIsUpdatingShortcut(true)
      const result = await window.electronAPI.updateCaptureShortcut(next)
      if (!result?.ok) {
        setStatus(result?.error || 'Shortcut update failed.')
        return
      }

      setShortcut(result.shortcut)
      setShortcutDraft(result.shortcut)
      setStatus(`Capture shortcut updated to ${result.shortcut}.`)
    } catch (err) {
      setStatus(`Shortcut update failed: ${formatFetchError(err)}`)
    } finally {
      setIsUpdatingShortcut(false)
    }
  }

  async function onIntegrateTelegram() {
    try {
      setIsStartingTelegramLink(true)
      setStatus('Generating Telegram event ID...')

      const res = await fetch(`${BACKEND_URL}/v1/integrations/telegram/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userID })
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Telegram integration failed: ${data.error || 'unknown error'}`)
        return
      }

      setTelegramEventID(data.event_id || '')
      setTelegramLinkStatus(data.status || 'pending')
      setBotUsername(data.bot_username || '')
      setStatus('Telegram event ID generated. Follow the steps below to connect.')
    } catch (err) {
      setStatus(`Telegram integration failed: ${formatFetchError(err)}`)
    } finally {
      setIsStartingTelegramLink(false)
    }
  }

  async function onAsk(event) {
    event.preventDefault()

    if (!question.trim()) {
      setStatus('Enter a question first.')
      return
    }

    try {
      setIsAsking(true)
      setStatus('Asking SnapRecall...')

      const res = await fetch(`${BACKEND_URL}/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userID,
          question: question.trim()
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Ask failed: ${data.error || 'unknown error'}`)
        return
      }

      setQueryResult(data)
      setStatus('Answer ready.')
    } catch (err) {
      setStatus(`Ask failed: ${formatFetchError(err)}`)
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>SnapRecall Desktop</h1>
        <p>Backend fixed to {BACKEND_URL}</p>
        <span className="status">{status}</span>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Quick Capture</h2>

          <div className="meta-row">
            <span className="meta-label">User ID:</span>
            <code>{userID}</code>
          </div>

          <div className="shortcut-panel">
            <label>
              Screenshot Shortcut
              <input
                value={shortcutDraft}
                onChange={(e) => setShortcutDraft(e.target.value)}
                placeholder="CommandOrControl+Shift+S"
              />
            </label>
            <button type="button" onClick={onSaveShortcut} disabled={isUpdatingShortcut}>
              {isUpdatingShortcut ? 'Saving Shortcut...' : 'Save Shortcut'}
            </button>
            <p className="hint">
              Current: <code>{shortcut}</code>
            </p>
          </div>

          <button type="button" onClick={captureAndSave} disabled={isSavingCapture}>
            {isSavingCapture ? 'Capturing...' : 'Capture and Save'}
          </button>

          {imageDataURL ? (
            <div className="preview-wrap">
              <h3>Latest Capture</h3>
              <img src={imageDataURL} alt="capture preview" className="preview" />
            </div>
          ) : null}

          {captureResult ? (
            <div className="result">
              <h3>Capture Result</h3>
              <pre>{JSON.stringify(captureResult, null, 2)}</pre>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Telegram Integration</h2>
          <button
            type="button"
            onClick={onIntegrateTelegram}
            disabled={isStartingTelegramLink || telegramLinkStatus === 'pending'}
          >
            {isStartingTelegramLink ? 'Generating Event ID...' : 'Integrate with Telegram'}
          </button>

          {telegramEventID ? (
            <div className="result">
              <h3>Connection Steps</h3>
              <p>
                1. Start your Telegram bot
                {botUsername ? (
                  <>
                    : <a href={`https://t.me/${botUsername}`}>@{botUsername}</a>
                  </>
                ) : (
                  '.'
                )}
              </p>
              <p>
                2. Send this event ID to the bot: <code>{telegramEventID}</code>
              </p>
              <p>
                3. Wait for status to change to <strong>linked</strong>.
              </p>
              <p>
                Current status: <strong>{telegramLinkStatus}</strong>
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Ask SnapRecall</h2>
          <form onSubmit={onAsk} className="stack">
            <label>
              Question
              <textarea
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What time is my exam and where?"
              />
            </label>

            <button type="submit" disabled={isAsking}>
              {isAsking ? 'Asking...' : 'Ask'}
            </button>
          </form>

          {queryResult ? (
            <div className="result">
              <h3>Answer</h3>
              <pre>{JSON.stringify(queryResult, null, 2)}</pre>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App
