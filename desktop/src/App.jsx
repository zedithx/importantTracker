import { useCallback, useEffect, useMemo, useState } from 'react'

const DEFAULT_BACKEND_URL = normalizeBackendURL(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
)
const AUTH_TOKEN_KEY = 'snaprecall.auth_token'
const AUTH_USER_KEY = 'snaprecall.auth_user'
const SKIP_TELEGRAM_KEY = 'snaprecall.skip_telegram_setup'

const TAB_KEYS = {
  DASHBOARD: 'dashboard',
  CAPTURES: 'captures',
  RECALL: 'recall',
  SETTINGS: 'settings'
}

const ICONS = {
  // Login
  appBolt: 'https://www.figma.com/api/mcp/asset/a59c43ab-3761-42ce-945e-c63f78cd2688',
  google: 'https://www.figma.com/api/mcp/asset/87bd7580-0de6-40b9-9b81-080018aad325',
  github: 'https://www.figma.com/api/mcp/asset/74bbaae1-0e3e-4129-8f62-42b3e72846d6',
  email: 'https://www.figma.com/api/mcp/asset/93df7c2c-a9b3-4a26-9b40-bb189099e3e3',
  lock: 'https://www.figma.com/api/mcp/asset/6a191492-4fa9-46bc-8121-aaca282ecd72',
  arrowRight: 'https://www.figma.com/api/mcp/asset/dea97a0b-6ce0-46ee-9cf9-ee641ac6873a',

  // Telegram setup
  telegram: 'https://www.figma.com/api/mcp/asset/a90331e3-3336-436d-a63a-27fcf225e403',
  telegramLink: 'https://www.figma.com/api/mcp/asset/10641bb6-110f-40db-a486-f186b5fdf040',
  telegramOpen: 'https://www.figma.com/api/mcp/asset/4c512f3d-bfe4-4680-a5c3-1e245ba9076d',
  copy: 'https://www.figma.com/api/mcp/asset/ddbbfba4-895e-49e9-9719-cab5a3758516',
  check: 'https://www.figma.com/api/mcp/asset/edc04d6b-6be1-432b-baa5-1b2d48d5b14c',

  // Sidebar
  profile: 'https://www.figma.com/api/mcp/asset/6af11edc-84a5-471a-b538-e0fd638fe8f0',
  profileChevron: 'https://www.figma.com/api/mcp/asset/b7b04dc6-2104-4012-af20-0a2752d1ac68',
  quickCapture: 'https://www.figma.com/api/mcp/asset/faed6681-c59e-4db8-8b4e-f25e98772831',
  navDashboard: 'https://www.figma.com/api/mcp/asset/8dd58023-a94f-4ad9-a311-fc347baf4307',
  navCaptures: 'https://www.figma.com/api/mcp/asset/903357b3-8c91-4b17-98cf-a03637f074f4',
  navRecall: 'https://www.figma.com/api/mcp/asset/c2450b0f-bfac-4759-bb9c-c6675e1e8a34',
  navSettings: 'https://www.figma.com/api/mcp/asset/01ecb4aa-ae2a-47e4-af15-bad50be36e87',

  // Workspace
  demoCapture: 'https://www.figma.com/api/mcp/asset/93d1ba52-8749-4d39-930c-b84a08d4a5d2',
  search: 'https://www.figma.com/api/mcp/asset/744da08e-9ad2-4cd3-9173-b5e8739bd3ee',
  filter: 'https://www.figma.com/api/mcp/asset/b8fb841c-e3b7-4e66-a2b4-f22e1fb4059b',
  rowAcademic: 'https://www.figma.com/api/mcp/asset/9a90d15b-d6d5-4dfe-b384-4fec4c237b54',
  rowTravel: 'https://www.figma.com/api/mcp/asset/51d0b242-f45a-4277-9e18-5bbe8afb5aff',
  rowHealth: 'https://www.figma.com/api/mcp/asset/62ffe332-0171-4469-896b-94dd2f7537a2',
  rowWork: 'https://www.figma.com/api/mcp/asset/cac690a7-4487-4dca-ba71-993b4798e4bc',
  rowExpand: 'https://www.figma.com/api/mcp/asset/bc561891-b3bc-4d5f-8c03-d574387786a4'
}

function normalizeBackendURL(raw) {
  const value = String(raw || '').trim()
  if (!value) {
    return 'http://localhost:8080'
  }
  return value.replace(/\/+$/, '')
}

function getBackendDownHint(backendURL) {
  return `Cannot reach backend at ${backendURL}. Start it with: cd backend && go run ./cmd/server`
}

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

function loadStoredAuthUser() {
  const raw = window.localStorage.getItem(AUTH_USER_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.user_id === 'string' &&
      parsed.user_id.trim() &&
      typeof parsed.email === 'string' &&
      parsed.email.trim()
    ) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function saveAuthSession(token, user) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

function clearAuthSession() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_USER_KEY)
}

function loadSkipTelegramSetup() {
  return window.localStorage.getItem(SKIP_TELEGRAM_KEY) === '1'
}

function saveSkipTelegramSetup(skip) {
  window.localStorage.setItem(SKIP_TELEGRAM_KEY, skip ? '1' : '0')
}

function formatFetchError(err, backendURL) {
  const message = String(err?.message || err || '')
  if (message.toLowerCase().includes('failed to fetch')) {
    return getBackendDownHint(backendURL)
  }
  return message || 'Request failed.'
}

function classifyStatusTone(status) {
  const text = String(status || '').toLowerCase()
  if (!text || text === 'ready') {
    return 'neutral'
  }
  if (text.includes('failed') || text.includes('error')) {
    return 'danger'
  }
  if (
    text.includes('saved') ||
    text.includes('linked') ||
    text.includes('success') ||
    text.includes('logged in') ||
    text.includes('ready')
  ) {
    return 'success'
  }
  return 'info'
}

function getDisplayName(email) {
  const normalized = String(email || '').trim()
  if (!normalized) {
    return 'SnapRecall User'
  }

  const local = normalized.split('@')[0]
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (!parts.length) {
    return 'SnapRecall User'
  }

  return parts
    .slice(0, 3)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function formatCaptureDate(raw) {
  if (!raw) {
    return 'Unknown date'
  }
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function confidenceLabel(fields) {
  if (!Array.isArray(fields) || !fields.length) {
    return 'N/A confidence'
  }

  const scored = fields.filter((field) => typeof field?.confidence === 'number')
  if (!scored.length) {
    return 'N/A confidence'
  }

  const avg = scored.reduce((sum, field) => sum + field.confidence, 0) / scored.length
  return `${Math.round(avg * 100)}% confidence`
}

function extractTitle(record) {
  if (!record) {
    return 'Untitled capture'
  }

  const firstField = Array.isArray(record.fields)
    ? record.fields.find((field) => typeof field?.value === 'string' && field.value.trim())
    : null

  if (firstField?.value) {
    return firstField.value.trim().slice(0, 72)
  }

  if (typeof record.summary === 'string' && record.summary.trim()) {
    return record.summary.trim().slice(0, 72)
  }

  if (typeof record.source?.title === 'string' && record.source.title.trim()) {
    return record.source.title.trim().slice(0, 72)
  }

  return 'Untitled capture'
}

function extractTag(record) {
  const raw = String(record?.tag || '').trim().toLowerCase()
  if (!raw) {
    return 'general'
  }

  if (raw.includes('exam') || raw.includes('study') || raw.includes('school')) {
    return 'academic'
  }
  if (raw.includes('travel') || raw.includes('flight') || raw.includes('hotel')) {
    return 'travel'
  }
  if (raw.includes('health') || raw.includes('medical') || raw.includes('doctor')) {
    return 'health'
  }
  if (raw.includes('work') || raw.includes('meeting') || raw.includes('office')) {
    return 'work'
  }

  return raw
}

function getTagIcon(tag) {
  if (tag === 'academic') {
    return ICONS.rowAcademic
  }
  if (tag === 'travel') {
    return ICONS.rowTravel
  }
  if (tag === 'health') {
    return ICONS.rowHealth
  }
  if (tag === 'work') {
    return ICONS.rowWork
  }
  return ICONS.rowAcademic
}

function buildFactsCount(records) {
  return records.reduce((sum, record) => {
    if (Array.isArray(record?.fields) && record.fields.length) {
      return sum + record.fields.length
    }
    return sum + 1
  }, 0)
}

function App() {
  const backendURL = DEFAULT_BACKEND_URL

  const [authToken, setAuthToken] = useState(() => {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
  })
  const [authUser, setAuthUser] = useState(loadStoredAuthUser)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(Boolean(authToken))

  const [status, setStatus] = useState('Ready')
  const [question, setQuestion] = useState('')
  const [queryResult, setQueryResult] = useState(null)
  const [captureResult, setCaptureResult] = useState(null)
  const [imageDataURL, setImageDataURL] = useState('')

  const [isAsking, setIsAsking] = useState(false)
  const [isSavingCapture, setIsSavingCapture] = useState(false)
  const [isDeletingCapture, setIsDeletingCapture] = useState(false)
  const [isUpdatingShortcut, setIsUpdatingShortcut] = useState(false)
  const [isStartingTelegramLink, setIsStartingTelegramLink] = useState(false)
  const [isCheckingTelegramLink, setIsCheckingTelegramLink] = useState(false)

  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+S')
  const [shortcutDraft, setShortcutDraft] = useState('CommandOrControl+Shift+S')
  const [activeTab, setActiveTab] = useState(TAB_KEYS.CAPTURES)

  const [recentCaptures, setRecentCaptures] = useState([])
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCaptureID, setSelectedCaptureID] = useState('')

  const [telegramEventID, setTelegramEventID] = useState('')
  const [telegramLinkStatus, setTelegramLinkStatus] = useState('not_linked')
  const [botUsername, setBotUsername] = useState('')
  const [allowTelegramSkip, setAllowTelegramSkip] = useState(loadSkipTelegramSetup)

  const authHeaders = useMemo(() => {
    if (!authToken) {
      return {}
    }

    return {
      Authorization: `Bearer ${authToken}`
    }
  }, [authToken])

  const hasElectronAPI = useMemo(
    () => Boolean(window.electronAPI && window.electronAPI.captureScreen),
    []
  )

  const userID = authUser?.user_id || ''
  const statusTone = classifyStatusTone(status)
  const isTelegramLinked = telegramLinkStatus === 'linked'
  const requiresTelegramSetup = Boolean(authUser) && !isTelegramLinked && !allowTelegramSkip
  const showWorkspace = Boolean(authUser) && !requiresTelegramSetup
  const displayName = getDisplayName(authUser?.email)

  const filteredCaptures = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) {
      return recentCaptures
    }

    return recentCaptures.filter((record) => {
      const title = extractTitle(record).toLowerCase()
      const summary = String(record.summary || '').toLowerCase()
      const tag = extractTag(record).toLowerCase()
      const source = String(record.source?.title || '').toLowerCase()
      return (
        title.includes(query) ||
        summary.includes(query) ||
        tag.includes(query) ||
        source.includes(query)
      )
    })
  }, [recentCaptures, searchTerm])

  const selectedCapture = useMemo(() => {
    if (!filteredCaptures.length) {
      return null
    }

    const matched = filteredCaptures.find((record) => record.id === selectedCaptureID)
    if (matched) {
      return matched
    }

    return filteredCaptures[0]
  }, [filteredCaptures, selectedCaptureID])

  const captureCount = recentCaptures.length
  const factsCount = buildFactsCount(recentCaptures)

  const loadRecentCaptures = useCallback(async () => {
    if (!authUser) {
      setRecentCaptures([])
      return
    }

    try {
      setIsLoadingCaptures(true)
      const res = await fetch(`${backendURL}/v1/captures/recent?limit=40`, {
        method: 'GET',
        headers: {
          ...authHeaders
        }
      })

      const data = await res.json()
      if (!res.ok || !Array.isArray(data?.captures)) {
        return
      }

      setRecentCaptures(data.captures)
      if (data.captures.length) {
        setSelectedCaptureID((prev) => prev || data.captures[0].id)
      }
    } catch {
      // Keep existing view if fetch fails.
    } finally {
      setIsLoadingCaptures(false)
    }
  }, [authHeaders, authUser, backendURL])

  const captureAndSave = useCallback(async () => {
    if (!authUser) {
      setStatus('Please log in to capture and save.')
      return
    }

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
      const res = await fetch(`${backendURL}/v1/captures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Capture failed: ${data.error || 'unknown error'}`)
        return
      }

      setCaptureResult(data)
      setStatus('Capture saved successfully.')
      await loadRecentCaptures()
      setActiveTab(TAB_KEYS.CAPTURES)
    } catch (err) {
      setStatus(`Capture failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsSavingCapture(false)
    }
  }, [authHeaders, authUser, backendURL, hasElectronAPI, loadRecentCaptures, userID])

  useEffect(() => {
    if (!authToken) {
      setAuthUser(null)
      setIsCheckingAuth(false)
      return
    }

    let cancelled = false

    async function validateAuthToken() {
      try {
        setIsCheckingAuth(true)
        const res = await fetch(`${backendURL}/v1/auth/me`, {
          method: 'GET',
          headers: {
            ...authHeaders
          }
        })
        const data = await res.json()

        if (!res.ok || !data?.user) {
          if (!cancelled) {
            clearAuthSession()
            setAuthToken('')
            setAuthUser(null)
          }
          return
        }

        if (!cancelled) {
          setAuthUser(data.user)
          saveAuthSession(authToken, data.user)
        }
      } catch {
        if (!cancelled) {
          clearAuthSession()
          setAuthToken('')
          setAuthUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false)
        }
      }
    }

    validateAuthToken()

    return () => {
      cancelled = true
    }
  }, [authHeaders, authToken, backendURL])

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
        setStatus('Could not load app info.')
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
    if (!authToken || !authUser?.user_id) {
      setTelegramEventID('')
      setTelegramLinkStatus('not_linked')
      return
    }

    let cancelled = false

    async function loadTelegramStatus() {
      try {
        setIsCheckingTelegramLink(true)
        const res = await fetch(`${backendURL}/v1/integrations/telegram/me`, {
          method: 'GET',
          headers: {
            ...authHeaders
          }
        })
        const data = await res.json()

        if (!cancelled) {
          const nextStatus = data?.status || 'not_linked'
          setTelegramLinkStatus(nextStatus)
          if (nextStatus === 'linked') {
            setTelegramEventID('')
            setAllowTelegramSkip(false)
            saveSkipTelegramSetup(false)
          }
        }
      } catch {
        if (!cancelled) {
          setTelegramLinkStatus('not_linked')
        }
      } finally {
        if (!cancelled) {
          setIsCheckingTelegramLink(false)
        }
      }
    }

    loadTelegramStatus()

    return () => {
      cancelled = true
    }
  }, [authHeaders, authToken, authUser?.user_id, backendURL])

  useEffect(() => {
    if (!telegramEventID || telegramLinkStatus !== 'pending') {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `${backendURL}/v1/integrations/telegram/status?event_id=${encodeURIComponent(telegramEventID)}`
        )
        if (!res.ok) {
          return
        }

        const data = await res.json()
        if (data?.status) {
          setTelegramLinkStatus(data.status)
          if (data.status === 'linked') {
            setAllowTelegramSkip(false)
            saveSkipTelegramSetup(false)
            setStatus('Telegram linked successfully.')
            await loadRecentCaptures()
          }
        }
      } catch {
        // Keep polling while pending.
      }
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [backendURL, loadRecentCaptures, telegramEventID, telegramLinkStatus])

  useEffect(() => {
    if (!showWorkspace) {
      return
    }

    loadRecentCaptures()
  }, [loadRecentCaptures, showWorkspace])

  useEffect(() => {
    if (!selectedCapture && captureResult) {
      setSelectedCaptureID(String(captureResult.capture_id || ''))
    }
  }, [captureResult, selectedCapture])

  async function onAuthSubmit(event) {
    event.preventDefault()

    const email = authEmail.trim()
    const password = authPassword
    if (!email || !password) {
      setStatus('Email and password are required.')
      return
    }

    try {
      setIsAuthenticating(true)
      setStatus(authMode === 'register' ? 'Creating account...' : 'Logging in...')

      const endpoint = authMode === 'register' ? '/v1/auth/register' : '/v1/auth/login'
      const res = await fetch(`${backendURL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()
      if (!res.ok || !data?.token || !data?.user) {
        setStatus(`Auth failed: ${data?.error || 'unknown error'}`)
        return
      }

      setAuthToken(data.token)
      setAuthUser(data.user)
      setAuthPassword('')
      setTelegramEventID('')
      setTelegramLinkStatus('checking')
      setAllowTelegramSkip(false)
      saveSkipTelegramSetup(false)
      saveAuthSession(data.token, data.user)
      setStatus(authMode === 'register' ? 'Account created and logged in.' : 'Logged in.')
    } catch (err) {
      setStatus(`Auth failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsAuthenticating(false)
    }
  }

  function onLogout() {
    clearAuthSession()
    setAuthToken('')
    setAuthUser(null)
    setAuthPassword('')
    setTelegramEventID('')
    setTelegramLinkStatus('not_linked')
    setRecentCaptures([])
    setCaptureResult(null)
    setQueryResult(null)
    setActiveTab(TAB_KEYS.CAPTURES)
    setAllowTelegramSkip(false)
    saveSkipTelegramSetup(false)
    setStatus('Logged out.')
  }

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
      setStatus(`Shortcut update failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsUpdatingShortcut(false)
    }
  }

  async function onStartTelegramLink() {
    if (!authUser) {
      setStatus('Please log in to connect Telegram.')
      return
    }

    try {
      setIsStartingTelegramLink(true)
      setStatus('Preparing Telegram connection...')

      const res = await fetch(`${backendURL}/v1/integrations/telegram/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ user_id: userID })
      })

      const data = await res.json()
      if (!res.ok) {
        setStatus(`Telegram integration failed: ${data.error || 'unknown error'}`)
        return
      }

      const nextStatus = data.status || 'pending'
      setTelegramEventID(data.event_id || '')
      setTelegramLinkStatus(nextStatus)
      setBotUsername(data.bot_username || '')

      if (nextStatus === 'linked') {
        setAllowTelegramSkip(false)
        saveSkipTelegramSetup(false)
        setStatus('Telegram is already linked for this account.')
      } else {
        setStatus('Telegram event ID ready. Send it to your bot to complete linking.')
      }
    } catch (err) {
      setStatus(`Telegram integration failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsStartingTelegramLink(false)
    }
  }

  async function onCheckTelegramStatus() {
    if (!telegramEventID) {
      return
    }

    try {
      setIsCheckingTelegramLink(true)
      const res = await fetch(
        `${backendURL}/v1/integrations/telegram/status?event_id=${encodeURIComponent(telegramEventID)}`
      )
      const data = await res.json()
      if (!res.ok) {
        setStatus(`Telegram status check failed: ${data.error || 'unknown error'}`)
        return
      }

      if (data?.status) {
        setTelegramLinkStatus(data.status)
        if (data.status === 'linked') {
          setAllowTelegramSkip(false)
          saveSkipTelegramSetup(false)
          setStatus('Telegram linked successfully.')
        } else {
          setStatus(`Current Telegram status: ${data.status}`)
        }
      }
    } catch (err) {
      setStatus(`Telegram status check failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsCheckingTelegramLink(false)
    }
  }

  function onSkipTelegramSetup() {
    setAllowTelegramSkip(true)
    saveSkipTelegramSetup(true)
    setStatus('Telegram setup skipped for now.')
  }

  async function onAsk(event) {
    event.preventDefault()

    if (!authUser) {
      setStatus('Please log in to ask SnapRecall.')
      return
    }

    if (!question.trim()) {
      setStatus('Enter a question first.')
      return
    }

    try {
      setIsAsking(true)
      setStatus('Asking SnapRecall...')

      const res = await fetch(`${backendURL}/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
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
      setActiveTab(TAB_KEYS.RECALL)
    } catch (err) {
      setStatus(`Ask failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsAsking(false)
    }
  }

  async function onCopyEventID() {
    if (!telegramEventID) {
      return
    }

    try {
      await navigator.clipboard.writeText(telegramEventID)
      setStatus('Event ID copied.')
    } catch {
      setStatus('Copy failed. You can copy the code manually.')
    }
  }

  async function onDeleteSelectedCapture() {
    if (!selectedCapture) {
      return
    }

    const confirmed = window.confirm(`Delete "${extractTitle(selectedCapture)}"? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      setIsDeletingCapture(true)
      setStatus('Deleting capture...')

      const res = await fetch(`${backendURL}/v1/captures/${encodeURIComponent(selectedCapture.id)}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders
        }
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus(`Delete failed: ${data?.error || 'unknown error'}`)
        return
      }

      if (captureResult?.capture_id === selectedCapture.id) {
        setCaptureResult(null)
      }
      if (queryResult?.source_capture_id === selectedCapture.id) {
        setQueryResult(null)
      }

      setSelectedCaptureID('')
      await loadRecentCaptures()
      setStatus('Capture deleted.')
    } catch (err) {
      setStatus(`Delete failed: ${formatFetchError(err, backendURL)}`)
    } finally {
      setIsDeletingCapture(false)
    }
  }

  function renderLoginScreen() {
    const isRegister = authMode === 'register'
    return (
      <div className="screen-frame">
        <div className="login-shell">
          <aside className="login-brand">
            <div className="brand-glow glow-1" />
            <div className="brand-glow glow-2" />
            <div className="brand-content">
              <div className="brand-icon">
                <img src={ICONS.appBolt} alt="" />
              </div>
              <h2>SnapRecall</h2>
              <p>Capture in 1 second. Recall in 1 second. Your AI-powered screenshot memory.</p>
              <div className="brand-tags">
                <span>AI Extraction</span>
                <span>Telegram Sync</span>
                <span>Instant Recall</span>
              </div>
            </div>
          </aside>

          <section className="login-panel">
            <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p>{isRegister ? 'Sign up to start saving captures' : 'Sign in to access your captures'}</p>

            <div className="oauth-row">
              <button type="button" className="ghost-cta" disabled>
                <img src={ICONS.google} alt="" />
                <span>Google</span>
              </button>
              <button type="button" className="ghost-cta" disabled>
                <img src={ICONS.github} alt="" />
                <span>GitHub</span>
              </button>
            </div>

            <div className="divider">or continue with email</div>

            <form className="login-form" onSubmit={onAuthSubmit}>
              <label className="dark-input">
                <img src={ICONS.email} alt="" />
                <input
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                />
              </label>

              <label className="dark-input">
                <img src={ICONS.lock} alt="" />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
              </label>

              <button
                className="link-inline"
                type="button"
                onClick={() => setStatus('Use password reset from your account provider for now.')}
              >
                Forgot password?
              </button>

              <button type="submit" className="primary-gradient" disabled={isAuthenticating || isCheckingAuth}>
                <span>
                  {isAuthenticating
                    ? isRegister
                      ? 'Creating...'
                      : 'Signing in...'
                    : isRegister
                      ? 'Create Account'
                      : 'Sign In'}
                </span>
                <img src={ICONS.arrowRight} alt="" />
              </button>
            </form>

            <div className="auth-switch">
              <span>{isRegister ? 'Already have an account?' : "Don't have an account?"}</span>
              <button
                type="button"
                onClick={() => setAuthMode(isRegister ? 'login' : 'register')}
                disabled={isAuthenticating || isCheckingAuth}
              >
                {isRegister ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderTelegramSetup() {
    const hasCode = telegramEventID && telegramLinkStatus !== 'not_linked'
    const steps = hasCode
      ? [
          { number: '1', label: 'Open Bot', state: 'done' },
          { number: '2', label: 'Verify', state: 'active' },
          { number: '3', label: 'Configure', state: isTelegramLinked ? 'done' : '' },
          { number: '4', label: 'Done', state: isTelegramLinked ? 'done' : '' }
        ]
      : [
          { number: '1', label: 'Open Bot', state: 'active' },
          { number: '2', label: 'Link', state: '' },
          { number: '3', label: 'Configure', state: '' }
        ]

    return (
      <div className="screen-frame">
        <div className="telegram-shell">
          <div className="telegram-head-icon">
            <img src={ICONS.telegram} alt="" />
          </div>
          <h1>Connect Telegram</h1>
          <p>Link your Telegram to capture and recall on the go</p>

	          <div className={`telegram-steps ${hasCode ? 'mode-verify' : 'mode-open'}`}>
	            {steps.map((step) => (
	              <div key={`${step.number}-${step.label}`} className={`step ${step.state}`}>
	                <span>{step.state === 'done' ? '✓' : step.number}</span>
	                <label>{step.label}</label>
	              </div>
	            ))}
	          </div>

          <div className="telegram-card">
            {!hasCode ? (
              <>
                <h2>Step 1: Open SnapRecall Bot</h2>
	                <p>
	                  Open Telegram and start a conversation with our bot. This bot will receive your
	                  captures and answer your questions.
	                </p>

                <div className="telegram-bot-card">
                  <div className="bot-identity">
                    <div className="bot-icon">
                      <img src={ICONS.telegramLink} alt="" />
                    </div>
                    <div>
                      <strong>{botUsername ? `@${botUsername}` : '@SnapRecallBot'}</strong>
                      <span>SnapRecall AI Assistant</span>
                    </div>
                  </div>

                  <a
                    className="telegram-open-link"
                    href={botUsername ? `https://t.me/${botUsername}` : 'https://t.me'}
                    target="_blank"
                    rel="noreferrer"
	                  >
	                    <span>Open in Telegram</span>
	                    <img src={ICONS.telegramOpen} alt="" />
	                  </a>
	                </div>

                <button
                  type="button"
                  className="primary-gradient"
                  onClick={onStartTelegramLink}
                  disabled={isStartingTelegramLink || isCheckingTelegramLink}
                >
                  <span>{isStartingTelegramLink ? 'Generating Event ID...' : "I've opened the bot"}</span>
                  <img src={ICONS.arrowRight} alt="" />
                </button>
              </>
            ) : (
              <>
                <h2>Step 2: Send verification code</h2>
                <p>Send this code to your SnapRecall bot in Telegram to verify your account link.</p>

                <div className="telegram-code-block">
                  <label>Your verification code</label>
                  <div className="code-row">
                    <code>{telegramEventID}</code>
                    <button type="button" onClick={onCopyEventID}>
                      <img src={ICONS.copy} alt="" />
                      Copy
                    </button>
                  </div>
	                  <small>Code expires in 10 minutes</small>
	                  
	                </div>

                <button
                  type="button"
                  className="primary-gradient"
                  onClick={onCheckTelegramStatus}
                  disabled={isCheckingTelegramLink}
                >
                  <span>{isCheckingTelegramLink ? 'Checking Link...' : "I've sent the code"}</span>
                  <img src={ICONS.arrowRight} alt="" />
                </button>
              </>
            )}
          </div>

          <button type="button" className="link-inline subtle" onClick={onSkipTelegramSetup}>
            Skip for now — you can connect later in Settings
          </button>
          <div className="privacy-note">
            <img src={ICONS.check} alt="" />
            <span>End-to-end encrypted · Your data stays private</span>
          </div>
        </div>
      </div>
    )
  }

  function renderCaptureRows() {
    if (isLoadingCaptures) {
      return <div className="history-empty">Loading captures...</div>
    }

    if (!filteredCaptures.length) {
      return (
        <div className="history-empty">
          <strong>No captures yet.</strong>
          <p>Use the capture button above to save your first record.</p>
        </div>
      )
    }

    return filteredCaptures.map((record) => {
      const tag = extractTag(record)
      const active = selectedCapture?.id === record.id
      return (
        <button
          key={record.id}
          type="button"
          className={`history-row ${active ? 'active' : ''}`}
          onClick={() => setSelectedCaptureID(record.id)}
        >
          <div className="history-icon-wrap">
            <img src={getTagIcon(tag)} alt="" />
          </div>
          <div className="history-content">
            <div className="history-top">
              <h3>{extractTitle(record)}</h3>
              <span className="tag-pill">{tag}</span>
            </div>
            <p>
              {record.fields?.length || 1} facts · {confidenceLabel(record.fields)} · {formatCaptureDate(record.captured_at)}
            </p>
          </div>
          <img src={ICONS.rowExpand} alt="" className="row-expand" />
        </button>
      )
    })
  }

  function renderCaptureDetails() {
    const record = selectedCapture
    if (!record) {
      return (
        <div className="capture-demo-body">
          <div className="capture-preview-empty">Capture details will appear here.</div>
        </div>
      )
    }

    const sourceTitle = record.source?.title || 'Captured screen'
    const lines =
      Array.isArray(record.fields) && record.fields.length
        ? record.fields.slice(0, 5).map((field) => `${field.type}: ${field.value}`)
        : [record.summary || 'No extracted fields yet.']

    return (
      <div className="capture-demo-body">
        {imageDataURL ? (
          <img className="capture-preview-image" src={imageDataURL} alt="Latest captured screen" />
        ) : (
          <div className="capture-preview-empty capture-preview-inline">
            Live screenshot preview appears after your first capture.
          </div>
        )}
        <small>{sourceTitle}</small>
        <h4>{extractTitle(record)}</h4>
        {lines.map((line) => (
          <p key={`${record.id}-${line}`}>{line}</p>
        ))}
      </div>
    )
  }

  function renderCapturesTab(titleText) {
    return (
      <div className="workspace-content">
        <div className="captures-header-row">
          <div>
            <h1>{titleText}</h1>
            <p>
              {captureCount} captures · {factsCount} facts extracted
            </p>
          </div>
          <div className="shortcut-inline">
            <kbd>⌘</kbd>
            <span>+</span>
            <kbd>⇧</kbd>
            <span>+</span>
            <kbd>S</kbd>
            <small>to capture</small>
          </div>
        </div>

        <div className="capture-demo-box">
          <div className="capture-demo-head">
            <div>
              <img src={ICONS.demoCapture} alt="" />
              <span>Try a Capture</span>
              <b>Demo</b>
            </div>
            <div className="capture-demo-head-meta">
              {selectedCapture ? formatCaptureDate(selectedCapture.captured_at) : 'No capture selected'}
            </div>
          </div>

          {renderCaptureDetails()}

          <button
            type="button"
            className="primary-gradient capture-cta"
            onClick={captureAndSave}
            disabled={isSavingCapture}
          >
            <span>{isSavingCapture ? 'Capturing...' : 'Capture This'}</span>
          </button>

          <button
            type="button"
            className="danger-ghost capture-delete-cta"
            onClick={onDeleteSelectedCapture}
            disabled={!selectedCapture || isDeletingCapture}
          >
            {isDeletingCapture ? 'Deleting...' : 'Delete selected capture'}
          </button>
        </div>

        <div className="search-row">
          <label className="search-input">
            <img src={ICONS.search} alt="" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search captures, facts, dates..."
            />
          </label>
          <button type="button" className="filter-btn" onClick={() => setStatus('Filter presets coming soon.') }>
            <img src={ICONS.filter} alt="" />
            Filter
          </button>
        </div>

        <div className="history-list">{renderCaptureRows()}</div>
      </div>
    )
  }

  function renderRecallTab() {
    return (
      <div className="workspace-content recall-view">
        <h1>Recall</h1>
        <p>Ask SnapRecall directly in chat style without scrolling through raw captures.</p>

        <form onSubmit={onAsk} className="recall-form">
          <textarea
            rows={5}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What time is my exam and where is it?"
          />
          <button type="submit" className="primary-gradient" disabled={isAsking}>
            <span>{isAsking ? 'Thinking...' : 'Ask SnapRecall'}</span>
          </button>
        </form>

        {queryResult ? (
          <div className="answer-card">
            <h2>Answer</h2>
            <p>{queryResult.answer}</p>
            {queryResult.source_capture_id ? <small>Source: {queryResult.source_capture_id}</small> : null}
          </div>
        ) : null}
      </div>
    )
  }

  function renderSettingsTab() {
    return (
      <div className="workspace-content settings-view">
        <h1>Settings</h1>

        <section className="settings-card">
          <h2>Shortcut</h2>
          <p>Use your preferred global shortcut for instant capture.</p>
          <div className="settings-row">
            <input
              value={shortcutDraft}
              onChange={(event) => setShortcutDraft(event.target.value)}
              placeholder="CommandOrControl+Shift+S"
            />
            <button type="button" onClick={onSaveShortcut} disabled={isUpdatingShortcut}>
              {isUpdatingShortcut ? 'Saving...' : 'Save'}
            </button>
          </div>
          <small>Current shortcut: {shortcut}</small>
        </section>

        <section className="settings-card">
          <h2>Telegram</h2>
          <p>Status: {isTelegramLinked ? 'Connected' : 'Not connected'}</p>

          {!isTelegramLinked ? (
            <button
              type="button"
              onClick={onStartTelegramLink}
              disabled={isStartingTelegramLink || isCheckingTelegramLink}
            >
              {isStartingTelegramLink ? 'Generating Event ID...' : 'Connect Telegram'}
            </button>
          ) : null}

          {telegramEventID && !isTelegramLinked ? (
            <div className="event-id-inline">
              <code>{telegramEventID}</code>
              <button type="button" onClick={onCopyEventID}>
                Copy
              </button>
            </div>
          ) : null}
        </section>

        <section className="settings-card">
          <h2>Backend</h2>
          <p>{backendURL}</p>
        </section>

        <button type="button" className="logout-btn" onClick={onLogout}>
          Log Out
        </button>
      </div>
    )
  }

  function renderWorkspaceShell() {
    const navItems = [
      { key: TAB_KEYS.DASHBOARD, label: 'Dashboard', icon: ICONS.navDashboard },
      { key: TAB_KEYS.CAPTURES, label: 'Captures', icon: ICONS.navCaptures },
      { key: TAB_KEYS.RECALL, label: 'Recall', icon: ICONS.navRecall },
      { key: TAB_KEYS.SETTINGS, label: 'Settings', icon: ICONS.navSettings }
    ]

    return (
      <div className="screen-frame">
        <div className="workspace-shell">
          <aside className="workspace-sidebar">
            <button type="button" className="profile-btn" onClick={() => setActiveTab(TAB_KEYS.SETTINGS)}>
              <span className="profile-avatar">
                <img src={ICONS.profile} alt="" />
              </span>
              <span className="profile-meta">
                <strong>{displayName}</strong>
                <small>{authUser?.email}</small>
              </span>
              <img src={ICONS.profileChevron} alt="" className="profile-chevron" />
            </button>

            <div className="quick-capture-card">
              <div className="qc-title">
                <img src={ICONS.quickCapture} alt="" />
                <span>Quick Capture</span>
              </div>
              <div className="qc-shortcut">
                <kbd>⌘</kbd>
                <span>+</span>
                <kbd>Shift</kbd>
                <span>+</span>
                <kbd>{shortcut.endsWith('S') ? 'S' : 'Key'}</kbd>
              </div>
              <button type="button" className="quick-capture-action" onClick={captureAndSave} disabled={isSavingCapture}>
                {isSavingCapture ? 'Capturing...' : 'Capture now'}
              </button>
            </div>

            <div className="nav-label">Navigation</div>
            <nav className="workspace-nav">
              {navItems.map((item) => {
                const active = activeTab === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`nav-item ${active ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <img src={item.icon} alt="" />
                    <span>{item.label}</span>
                    {item.key === TAB_KEYS.CAPTURES ? <b>{captureCount}</b> : null}
                  </button>
                )
              })}
            </nav>

            <div className="telegram-footer">
              <span className={`dot ${isTelegramLinked ? 'on' : 'off'}`} />
              <span>{isTelegramLinked ? 'Telegram connected' : 'Telegram not connected'}</span>
            </div>
          </aside>

          <section className="workspace-main">
            <div className={`top-status tone-${statusTone}`}>{status}</div>

            {activeTab === TAB_KEYS.RECALL ? renderRecallTab() : null}
            {activeTab === TAB_KEYS.SETTINGS ? renderSettingsTab() : null}
            {activeTab === TAB_KEYS.DASHBOARD ? renderCapturesTab('Dashboard') : null}
            {activeTab === TAB_KEYS.CAPTURES ? renderCapturesTab('Captures') : null}

            <footer className="workspace-footbar">
              <div>
                <span className="sync-dot" /> Synced
                <span className="sep">|</span>
                <span>
                  {captureCount} captures · {factsCount} facts
                </span>
              </div>
              <div>
                <span>Local: {Math.max(3, Math.round((captureCount * 0.6 + factsCount * 0.1) * 10) / 10)} MB</span>
                <span className="sep">|</span>
                <span>v1.0.0</span>
              </div>
            </footer>
          </section>
        </div>
      </div>
    )
  }

  if (!authUser) {
    return renderLoginScreen()
  }

  if (requiresTelegramSetup) {
    return renderTelegramSetup()
  }

  return renderWorkspaceShell()
}

export default App
