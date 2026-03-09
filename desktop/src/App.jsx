import { useEffect, useMemo, useState } from 'react'

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080'

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

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function App() {
  const [backendURL, setBackendURL] = useState(DEFAULT_BACKEND_URL)
  const [userID, setUserID] = useState('u_1')
  const [chatID, setChatID] = useState('')
  const [tagHint, setTagHint] = useState('')
  const [sourceApp, setSourceApp] = useState('desktop')
  const [sourceTitle, setSourceTitle] = useState('Quick Capture')
  const [ocrText, setOCRText] = useState('')
  const [imageDataURL, setImageDataURL] = useState('')
  const [question, setQuestion] = useState('')
  const [captureResult, setCaptureResult] = useState(null)
  const [queryResult, setQueryResult] = useState(null)
  const [status, setStatus] = useState('Ready')
  const [isSaving, setIsSaving] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+S')

  const hasElectronAPI = useMemo(
    () => Boolean(window.electronAPI && window.electronAPI.captureScreen),
    []
  )

  async function handleCaptureScreen() {
    if (!hasElectronAPI) {
      setStatus('Screen capture only works inside Electron runtime.')
      return
    }

    try {
      setStatus('Capturing screen...')
      const dataUrl = await window.electronAPI.captureScreen()
      setImageDataURL(dataUrl)
      setStatus('Screen capture ready. Review and click Save Capture.')
    } catch (err) {
      setStatus(`Capture failed: ${String(err.message || err)}`)
    }
  }

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
        }
      } catch (_err) {
        setStatus('Could not load shortcut info.')
      }

      unsubscribe = window.electronAPI.onCaptureShortcut(async () => {
        setStatus('Shortcut triggered.')
        await handleCaptureScreen()
      })
    }

    init()

    return () => {
      unsubscribe()
    }
  }, [hasElectronAPI])

  async function onUploadFile(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const dataUrl = await fileToDataURL(file)
      setImageDataURL(dataUrl)
      setStatus('Image loaded from file.')
    } catch (err) {
      setStatus(`File load failed: ${String(err.message || err)}`)
    }
  }

  async function onPasteClipboard() {
    if (!navigator.clipboard?.read) {
      setStatus('Clipboard image read is not available in this environment.')
      return
    }

    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (!imageType) {
          continue
        }

        const blob = await item.getType(imageType)
        const file = new File([blob], `clipboard.${imageType.split('/')[1] || 'png'}`, {
          type: imageType
        })

        const dataUrl = await fileToDataURL(file)
        setImageDataURL(dataUrl)
        setStatus('Image pasted from clipboard.')
        return
      }

      setStatus('No image found in clipboard.')
    } catch (err) {
      setStatus(`Clipboard read failed: ${String(err.message || err)}`)
    }
  }

  async function onSaveCapture(event) {
    event.preventDefault()

    if (!userID.trim()) {
      setStatus('user_id is required.')
      return
    }

    if (!ocrText.trim() && !imageDataURL) {
      setStatus('Provide OCR text or capture/upload an image first.')
      return
    }

    const payload = {
      user_id: userID.trim(),
      ocr_text: ocrText.trim(),
      image_base64: imageDataURL ? getRawBase64(imageDataURL) : '',
      tag_hint: tagHint.trim(),
      source_app: sourceApp.trim(),
      source_title: sourceTitle.trim(),
      chat_id: chatID.trim()
    }

    try {
      setIsSaving(true)
      setStatus('Saving capture...')

      const res = await fetch(`${backendURL}/v1/captures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Save failed: ${data.error || 'unknown error'}`)
        return
      }

      setCaptureResult(data)
      setStatus('Capture saved successfully.')
    } catch (err) {
      setStatus(`Save failed: ${String(err.message || err)}`)
    } finally {
      setIsSaving(false)
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

      const res = await fetch(`${backendURL}/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userID.trim(),
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
      setStatus(`Ask failed: ${String(err.message || err)}`)
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>SnapRecall Desktop</h1>
        <p>Capture now. Recall instantly.</p>
        <span className="status">{status}</span>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Quick Capture</h2>

          <div className="row">
            <button type="button" onClick={handleCaptureScreen}>
              Capture Screen ({shortcut})
            </button>
            <button type="button" onClick={onPasteClipboard}>
              Paste Clipboard Image
            </button>
          </div>

          <label className="input-label">
            Upload image file
            <input type="file" accept="image/*" onChange={onUploadFile} />
          </label>

          <form onSubmit={onSaveCapture} className="stack">
            <label>
              Backend URL
              <input
                value={backendURL}
                onChange={(e) => setBackendURL(e.target.value)}
                placeholder="http://localhost:8080"
              />
            </label>

            <div className="row-2">
              <label>
                User ID
                <input
                  value={userID}
                  onChange={(e) => setUserID(e.target.value)}
                  placeholder="u_1"
                />
              </label>
              <label>
                Chat ID (optional)
                <input
                  value={chatID}
                  onChange={(e) => setChatID(e.target.value)}
                  placeholder="Telegram chat id"
                />
              </label>
            </div>

            <div className="row-2">
              <label>
                Tag Hint
                <input
                  value={tagHint}
                  onChange={(e) => setTagHint(e.target.value)}
                  placeholder="exam / flight / event"
                />
              </label>
              <label>
                Source App
                <input
                  value={sourceApp}
                  onChange={(e) => setSourceApp(e.target.value)}
                  placeholder="desktop"
                />
              </label>
            </div>

            <label>
              Source Title
              <input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="Quick Capture"
              />
            </label>

            <label>
              OCR Text (optional if image exists)
              <textarea
                rows={5}
                value={ocrText}
                onChange={(e) => setOCRText(e.target.value)}
                placeholder="Paste OCR text if available..."
              />
            </label>

            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Capture'}
            </button>
          </form>

          {imageDataURL ? (
            <div className="preview-wrap">
              <h3>Image Preview</h3>
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
