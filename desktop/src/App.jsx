import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appLogger, maskEmail, summarizeError } from './logger'
import TelegramSetupDialog from './components/TelegramSetupDialog'

const DEFAULT_BACKEND_URL = normalizeBackendURL(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
)
const AUTH_TOKEN_KEY = 'snaprecall.auth_token'
const AUTH_USER_KEY = 'snaprecall.auth_user'

const TAB_KEYS = {
  DASHBOARD: 'dashboard',
  CAPTURES: 'captures',
  RECALL: 'recall',
  SETTINGS: 'settings'
}
const APP_VERSION = '1.0.0'
const STORAGE_LIMIT_MB = 200
const CAPTURE_SUCCESS_STATUS = 'Capture saved successfully.'
const SCREEN_EXIT_DURATION_MS = 150
const SCREEN_ENTER_DURATION_MS = 380
const TAB_EXIT_DURATION_MS = 90
const TAB_ENTER_DURATION_MS = 260

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
  telegramNotice: 'https://www.figma.com/api/mcp/asset/166dab0c-10cc-4c7e-9c3d-40e1368ffdf2',
  telegramNoticeLink: 'https://www.figma.com/api/mcp/asset/90ffe303-216c-4569-8cd9-6c1da96f3065',
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
  rowExpand: 'https://www.figma.com/api/mcp/asset/bc561891-b3bc-4d5f-8c03-d574387786a4',
  recallBot: 'https://www.figma.com/api/mcp/asset/731ad4a1-a21b-4e58-8cdc-f7cc7309b1de',
  recallFocus: 'https://www.figma.com/api/mcp/asset/76f76ab8-6832-4b47-926e-7f0200f0a857',
  recallSend: 'https://www.figma.com/api/mcp/asset/529b3fad-91aa-424a-bec0-26c26cba9f5c',

  // Dashboard
  dashboardMetricCaptures: 'https://www.figma.com/api/mcp/asset/6830e6fe-ba70-4e40-bf1f-84689d45b53c',
  dashboardMetricFacts: 'https://www.figma.com/api/mcp/asset/37c68559-9664-4757-875a-b423cc0c7a42',
  dashboardMetricRecall: 'https://www.figma.com/api/mcp/asset/4eaa5f1b-6ad5-40a7-b6c7-1b841aa591af',
  dashboardMetricTrend: 'https://www.figma.com/api/mcp/asset/e9c2eda5-9758-4303-95d7-481c68e6fe94',
  dashboardActionCapture: 'https://www.figma.com/api/mcp/asset/ab780a4e-4c98-4f90-8d61-915e08597ef7',
  dashboardActionRecall: 'https://www.figma.com/api/mcp/asset/dbb2588e-4575-4566-9428-a80c25ce0f4f',
  dashboardActionArrow: 'https://www.figma.com/api/mcp/asset/70196a2b-90f6-462e-a6f9-ae7df27b69eb',
  dashboardRecentAcademic: 'https://www.figma.com/api/mcp/asset/fc5a886d-a0dd-4c4e-8259-38f54f808d02',
  dashboardRecentTravel: 'https://www.figma.com/api/mcp/asset/9294e21a-92f0-497d-be83-ac9fdfc1789c',
  dashboardRecentHealth: 'https://www.figma.com/api/mcp/asset/4addf838-9c01-4a5a-bb97-c7d7a5f95bab',

  // Settings
  settingsAccount: 'https://www.figma.com/api/mcp/asset/6b5a120c-d327-4d5d-a30a-356bc60aec6e',
  settingsAccountAvatar: 'https://www.figma.com/api/mcp/asset/bb93e14c-c013-494b-899b-2174ec4e6277',
  settingsKeyboard: 'https://www.figma.com/api/mcp/asset/e094f0d9-dc39-42ed-9fbc-3e60a9aa6d56',
  settingsTelegram: 'https://www.figma.com/api/mcp/asset/f49e27dd-dfcf-4b42-a05a-7acb82400bed',
  settingsConnectedCheck: 'https://www.figma.com/api/mcp/asset/d52e6192-4c9d-4ea3-9ec7-be8d9ff4d2ec',
  settingsDisconnect: 'https://www.figma.com/api/mcp/asset/07dd1cec-0d84-4441-94b2-5c0765404c34',
  settingsPrivacy: 'https://www.figma.com/api/mcp/asset/654e916c-51e1-4e22-8954-1062b222964b',
  settingsNotifications: 'https://www.figma.com/api/mcp/asset/1146b4f9-5848-460d-b006-2285d2ef0abf',
  settingsStorage: 'https://www.figma.com/api/mcp/asset/71630e2f-1cb9-4518-92c3-8fedc1acb11c',
  settingsAbout: 'https://www.figma.com/api/mcp/asset/62d6165a-f25e-4e48-947d-f4dd27856139',
  settingsExternalLink: 'https://www.figma.com/api/mcp/asset/7bd96ca9-7633-4c5f-ab76-4ee6add7e879'
}

const RECALL_SUGGESTIONS = [
  'What time is my exam and where?',
  "What's my flight number to Tokyo?",
  'When is my dentist appointment?'
]

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function buildSelectionRect(startPoint, endPoint) {
  const left = Math.min(startPoint.x, endPoint.x)
  const top = Math.min(startPoint.y, endPoint.y)
  const right = Math.max(startPoint.x, endPoint.x)
  const bottom = Math.max(startPoint.y, endPoint.y)

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }
}

function cropCapturedArea(dataUrl, selection, renderedSize) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const renderedWidth = Math.max(1, Math.round(renderedSize.width))
      const renderedHeight = Math.max(1, Math.round(renderedSize.height))
      const naturalWidth = Math.max(1, image.naturalWidth)
      const naturalHeight = Math.max(1, image.naturalHeight)
      const scaleX = naturalWidth / renderedWidth
      const scaleY = naturalHeight / renderedHeight

      const sx = clamp(Math.round(selection.x * scaleX), 0, naturalWidth - 1)
      const sy = clamp(Math.round(selection.y * scaleY), 0, naturalHeight - 1)
      const sw = clamp(Math.round(selection.width * scaleX), 1, naturalWidth - sx)
      const sh = clamp(Math.round(selection.height * scaleY), 1, naturalHeight - sy)

      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh

      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Unable to crop capture image.'))
        return
      }

      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      reject(new Error('Failed to load capture preview.'))
    }
    image.src = dataUrl
  })
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

function formatFetchError(err, backendURL) {
  const message = String(err?.message || err || '')
  const normalized = message.toLowerCase()
  if (
    normalized.includes('cannot reach backend') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed')
  ) {
    return getBackendDownHint(backendURL)
  }
  return message || 'Request failed.'
}

function isBackendConnectionMessage(message) {
  const normalized = String(message || '').trim().toLowerCase()
  return normalized.includes('cannot reach backend')
}

function extractErrorMessage(rawError, backendURL, fallbackMessage = 'Something went wrong.') {
  const message = formatFetchError(rawError, backendURL)
  return String(message || fallbackMessage).trim() || fallbackMessage
}

async function fetchJSONWithLogging(url, options = {}, event, meta = {}) {
  const method = String(options?.method || 'GET').toUpperCase()
  const startedAt = Date.now()

  appLogger.info(`${event}_request`, {
    url,
    method,
    ...meta
  })

  try {
    const res = await fetch(url, options)
    const text = await res.text()
    let data = null

    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text.slice(0, 300) }
      }
    }

    appLogger.info(`${event}_response`, {
      url,
      method,
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - startedAt,
      ...meta
    })

    return { res, data }
  } catch (err) {
    appLogger.error(`${event}_failed`, {
      url,
      method,
      duration_ms: Date.now() - startedAt,
      error: summarizeError(err),
      ...meta
    })
    throw err
  }
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

function parseCaptureTimestamp(raw) {
  if (!raw) {
    return null
  }

  const ts = new Date(raw).getTime()
  if (Number.isNaN(ts)) {
    return null
  }

  return ts
}

function formatRelativeCaptureTime(raw) {
  const timestamp = parseCaptureTimestamp(raw)
  if (!timestamp) {
    return 'Unknown time'
  }

  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000)
  if (diffMinutes <= 0) {
    return 'Just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) {
    return 'Yesterday'
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`
  }

  return formatCaptureDate(raw)
}

function formatCompactCount(value) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  return normalized.toLocaleString('en-US')
}

function getDayGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) {
    return 'Good morning'
  }
  if (hour < 18) {
    return 'Good afternoon'
  }
  return 'Good evening'
}

function getDashboardRecentVisual(tag) {
  if (tag === 'travel') {
    return {
      icon: ICONS.dashboardRecentTravel,
      tone: 'travel'
    }
  }
  if (tag === 'health') {
    return {
      icon: ICONS.dashboardRecentHealth,
      tone: 'health'
    }
  }

  return {
    icon: ICONS.dashboardRecentAcademic,
    tone: 'academic'
  }
}

function shortcutDisplayTokens(shortcutValue) {
  return String(shortcutValue || '')
    .split('+')
    .map((segment) => {
      const token = String(segment || '').trim()
      const lower = token.toLowerCase()
      if (!token) {
        return ''
      }
      if (
        lower === 'commandorcontrol' ||
        lower === 'cmdorctrl' ||
        lower === 'command' ||
        lower === 'meta'
      ) {
        return '⌘'
      }
      if (lower === 'control' || lower === 'ctrl') {
        return 'Ctrl'
      }
      if (lower === 'shift') {
        return 'Shift'
      }
      if (lower === 'option' || lower === 'alt') {
        return '⌥'
      }
      if (lower.startsWith('key') && token.length > 3) {
        return token.slice(3).toUpperCase()
      }
      if (lower.startsWith('digit') && token.length > 5) {
        return token.slice(5)
      }
      return token.length === 1 ? token.toUpperCase() : token
    })
    .filter(Boolean)
}

function getPlatformLabel() {
  const raw = String(navigator.userAgentData?.platform || navigator.platform || '').toLowerCase()
  if (raw.includes('mac')) {
    return 'macOS'
  }
  if (raw.includes('win')) {
    return 'Windows'
  }
  if (raw.includes('linux')) {
    return 'Linux'
  }
  return 'Desktop'
}

function resolveScreen(authUser, isCheckingAuth) {
  if (isCheckingAuth && !authUser) {
    return 'loading'
  }
  if (!authUser) {
    return 'login'
  }
  return 'workspace'
}

function App() {
  const backendURL = DEFAULT_BACKEND_URL
  const regionSurfaceRef = useRef(null)
  const lastErrorFingerprintRef = useRef({
    value: '',
    shownAt: 0
  })

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
  const [errorPopup, setErrorPopup] = useState(null)
  const [question, setQuestion] = useState('')
  const [queryResult, setQueryResult] = useState(null)
  const [lastAskedQuestion, setLastAskedQuestion] = useState('')
  const [captureResult, setCaptureResult] = useState(null)

  const [isAsking, setIsAsking] = useState(false)
  const [isSavingCapture, setIsSavingCapture] = useState(false)
  const [isDeletingCapture, setIsDeletingCapture] = useState(false)
  const [isUpdatingShortcut, setIsUpdatingShortcut] = useState(false)
  const [isStartingTelegramLink, setIsStartingTelegramLink] = useState(false)
  const [isCheckingTelegramLink, setIsCheckingTelegramLink] = useState(false)
  const [isDisconnectingTelegram, setIsDisconnectingTelegram] = useState(false)
  const [isTelegramSetupOpen, setIsTelegramSetupOpen] = useState(false)

  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+S')
  const [shortcutDraft, setShortcutDraft] = useState('CommandOrControl+Shift+S')
  const [activeTab, setActiveTab] = useState(TAB_KEYS.CAPTURES)
  const [displayTab, setDisplayTab] = useState(TAB_KEYS.CAPTURES)
  const [tabStage, setTabStage] = useState('idle')
  const [displayScreen, setDisplayScreen] = useState(() => resolveScreen(authUser, Boolean(authToken)))
  const [screenStage, setScreenStage] = useState('idle')

  const [recentCaptures, setRecentCaptures] = useState([])
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCaptureID, setSelectedCaptureID] = useState('')
  const [selectedCaptureIDs, setSelectedCaptureIDs] = useState([])
  const captureSelectionAnchorRef = useRef('')
  const [regionCaptureImage, setRegionCaptureImage] = useState('')
  const [regionSelection, setRegionSelection] = useState(null)
  const [selectionDragStart, setSelectionDragStart] = useState(null)

  const [telegramEventID, setTelegramEventID] = useState('')
  const [telegramLinkStatus, setTelegramLinkStatus] = useState('not_linked')
  const [botUsername, setBotUsername] = useState('')
  const [autoSyncCaptures, setAutoSyncCaptures] = useState(true)
  const [telegramIncludeSourceScreenshot, setTelegramIncludeSourceScreenshot] = useState(false)
  const [telegramQAMode, setTelegramQAMode] = useState(true)
  const [telegramDailyDigest, setTelegramDailyDigest] = useState(false)
  const [autoCaptureOnShortcut, setAutoCaptureOnShortcut] = useState(true)
  const [showCaptureConfirmation, setShowCaptureConfirmation] = useState(true)

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

  const statusTone = classifyStatusTone(status)
  const isTelegramLinked = telegramLinkStatus === 'linked'
  const isTelegramLinkPending = telegramLinkStatus === 'pending'
  const showWorkspace = Boolean(authUser)
  const displayName = getDisplayName(authUser?.email)
  const telegramBotHandle = botUsername ? `@${String(botUsername).replace(/^@+/, '')}` : '@SnapRecallBot'
  const linkedTelegramAccountLabel = useMemo(() => {
    const emailUser = String(authUser?.email || '').trim().split('@')[0] || ''
    const normalized = emailUser.replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
    if (normalized) {
      return `@${normalized}`
    }
    return `@${displayName.replace(/\s+/g, '_').toLowerCase()}`
  }, [authUser?.email, displayName])
  const isRegionSelectorOpen = Boolean(regionCaptureImage)
  const hasValidRegionSelection = Boolean(
    regionSelection && regionSelection.width >= 8 && regionSelection.height >= 8
  )
  const captureNowLabel = isSavingCapture
    ? 'Capturing...'
    : isRegionSelectorOpen
      ? 'Selecting...'
      : 'Capture now'
  const targetScreen = resolveScreen(authUser, isCheckingAuth)

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
  const selectedCaptureIDsSet = useMemo(() => new Set(selectedCaptureIDs), [selectedCaptureIDs])
  const selectedVisibleCaptureCount = useMemo(() => {
    return filteredCaptures.reduce((count, record) => {
      if (selectedCaptureIDsSet.has(record.id)) {
        return count + 1
      }
      return count
    }, 0)
  }, [filteredCaptures, selectedCaptureIDsSet])
  const allVisibleCapturesSelected =
    Boolean(filteredCaptures.length) && selectedVisibleCaptureCount === filteredCaptures.length
  const hasPartialVisibleCaptureSelection = selectedVisibleCaptureCount > 0 && !allVisibleCapturesSelected
  const selectedHiddenCaptureCount = Math.max(0, selectedCaptureIDs.length - selectedVisibleCaptureCount)
  const deleteTargetCaptureIDs = useMemo(() => {
    if (selectedCaptureIDs.length) {
      return selectedCaptureIDs
    }
    if (selectedCapture?.id) {
      return [selectedCapture.id]
    }
    return []
  }, [selectedCapture, selectedCaptureIDs])

  const captureCount = recentCaptures.length
  const factsCount = buildFactsCount(recentCaptures)
  const localStorageMB = Math.max(3, Math.round((captureCount * 0.6 + factsCount * 0.1) * 10) / 10)
  const storageUsageRatio = Math.min(1, localStorageMB / STORAGE_LIMIT_MB)
  const storageFill = Math.max(3, Math.round(storageUsageRatio * 1000) / 10)
  const platformLabel = getPlatformLabel()
  const shortcutTokens = shortcutDisplayTokens(shortcut)
  const dashboardGreeting = getDayGreeting()
  const dashboardRecentCaptures = useMemo(() => recentCaptures.slice(0, 3), [recentCaptures])
  const capturesThisWeek = useMemo(() => {
    const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return recentCaptures.reduce((count, record) => {
      const timestamp = parseCaptureTimestamp(record?.captured_at)
      if (timestamp && timestamp >= weekCutoff) {
        return count + 1
      }
      return count
    }, 0)
  }, [recentCaptures])
  const capturesToday = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayTimestamp = startOfToday.getTime()
    return recentCaptures.reduce((count, record) => {
      const timestamp = parseCaptureTimestamp(record?.captured_at)
      if (timestamp && timestamp >= todayTimestamp) {
        return count + 1
      }
      return count
    }, 0)
  }, [recentCaptures])
  const recallReadyCount = useMemo(() => {
    return recentCaptures.reduce((count, record) => {
      if (Array.isArray(record?.fields) && record.fields.length) {
        return count + 1
      }
      return count
    }, 0)
  }, [recentCaptures])
  const averageConfidencePercent = useMemo(() => {
    const confidenceValues = recentCaptures.flatMap((record) => {
      if (!Array.isArray(record?.fields)) {
        return []
      }
      return record.fields
        .filter((field) => typeof field?.confidence === 'number')
        .map((field) => field.confidence)
    })

    if (!confidenceValues.length) {
      return null
    }

    const average = confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    return Math.round(average * 100)
  }, [recentCaptures])
  const dashboardSubtitle = useMemo(() => {
    const captureSummary = captureCount
      ? `You have ${Math.min(captureCount, 3)} recent capture${captureCount === 1 ? '' : 's'}.`
      : 'No captures yet.'
    const syncSummary = isTelegramLinked
      ? 'Everything is synced with Telegram.'
      : 'Connect Telegram to unlock mobile recall.'
    return `${captureSummary} ${syncSummary}`
  }, [captureCount, isTelegramLinked])
  const dashboardStats = useMemo(
    () => [
      {
        key: 'captures',
        icon: ICONS.dashboardMetricCaptures,
        label: 'Total Captures',
        value: formatCompactCount(captureCount),
        detail: capturesThisWeek ? `+${capturesThisWeek} this week` : 'No captures this week'
      },
      {
        key: 'facts',
        icon: ICONS.dashboardMetricFacts,
        label: 'Facts Extracted',
        value: formatCompactCount(factsCount),
        detail:
          averageConfidencePercent === null ? 'No confidence score yet' : `${averageConfidencePercent}% avg confidence`
      },
      {
        key: 'recall',
        icon: ICONS.dashboardMetricRecall,
        label: 'Recall Ready',
        value: formatCompactCount(recallReadyCount),
        detail: capturesToday ? `${capturesToday} captured today` : 'No captures today'
      }
    ],
    [averageConfidencePercent, captureCount, capturesThisWeek, capturesToday, factsCount, recallReadyCount]
  )
  const loadingMessage = useMemo(() => {
    if (isCheckingAuth && !authUser) {
      return 'Restoring your workspace...'
    }
    if (isAuthenticating) {
      return authMode === 'register' ? 'Creating your account...' : 'Signing you in...'
    }
    if (isSavingCapture) {
      return 'Capturing and indexing screenshot...'
    }
    if (isAsking) {
      return 'Looking through your memory graph...'
    }
    if (isStartingTelegramLink) {
      return 'Preparing Telegram verification...'
    }
    if (isCheckingTelegramLink) {
      return 'Checking Telegram link status...'
    }
    if (isDisconnectingTelegram) {
      return 'Disconnecting Telegram integration...'
    }
    if (isDeletingCapture) {
      return 'Deleting selected capture...'
    }
    if (isUpdatingShortcut) {
      return 'Saving shortcut settings...'
    }
    return ''
  }, [
    authMode,
    authUser,
    isAsking,
    isAuthenticating,
    isCheckingAuth,
    isCheckingTelegramLink,
    isDisconnectingTelegram,
    isDeletingCapture,
    isSavingCapture,
    isStartingTelegramLink,
    isUpdatingShortcut
  ])

  const dismissErrorPopup = useCallback(() => {
    setErrorPopup(null)
  }, [])

  const showErrorPopup = useCallback(
    (title, rawError, options = {}) => {
      const message = String(
        options.message || extractErrorMessage(rawError, backendURL, options.fallbackMessage)
      ).trim()
      const detail = String(options.detail || '').trim()
      const kind = options.kind || (isBackendConnectionMessage(message) ? 'backend' : 'general')
      const fingerprint = `${title}|${message}|${detail}|${kind}`
      const now = Date.now()

      if (
        lastErrorFingerprintRef.current.value === fingerprint &&
        now - lastErrorFingerprintRef.current.shownAt < 5000
      ) {
        return message
      }

      lastErrorFingerprintRef.current = {
        value: fingerprint,
        shownAt: now
      }

      setErrorPopup({
        id: now,
        title: String(title || 'Unexpected error'),
        message,
        detail,
        kind
      })

      return message
    },
    [backendURL]
  )

  const reportError = useCallback(
    (title, rawError, options = {}) => {
      const message = showErrorPopup(title, rawError, options)
      if (!options.skipStatus) {
        setStatus(options.statusMessage || `${title}: ${message}`)
      }
      return message
    },
    [showErrorPopup]
  )

  const loadRecentCaptures = useCallback(async () => {
    if (!authUser) {
      setRecentCaptures([])
      setSelectedCaptureID('')
      setSelectedCaptureIDs([])
      captureSelectionAnchorRef.current = ''
      return
    }

    try {
      setIsLoadingCaptures(true)
      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/captures/recent?limit=40`,
        {
          method: 'GET',
          headers: {
            ...authHeaders
          }
        },
        'captures_recent',
        {
          user_id: authUser?.user_id || ''
        }
      )
      if (!res.ok) {
        reportError('Failed to load captures', data?.error || `request failed (${res.status})`)
        return
      }

      if (!Array.isArray(data?.captures)) {
        reportError('Failed to load captures', 'Unexpected captures response from backend.')
        return
      }

      setRecentCaptures(data.captures)
      if (data.captures.length) {
        const validCaptureIDs = new Set(data.captures.map((record) => record.id))
        setSelectedCaptureID((prev) => {
          if (validCaptureIDs.has(prev)) {
            return prev
          }
          return data.captures[0].id
        })
        setSelectedCaptureIDs((prev) => {
          const nextSelection = prev.filter((captureID) => validCaptureIDs.has(captureID))
          if (!nextSelection.length) {
            captureSelectionAnchorRef.current = ''
          }
          return nextSelection
        })
      } else {
        setSelectedCaptureID('')
        setSelectedCaptureIDs([])
        captureSelectionAnchorRef.current = ''
      }
    } catch (err) {
      reportError('Failed to load captures', err)
    } finally {
      setIsLoadingCaptures(false)
    }
  }, [authHeaders, authUser, backendURL, reportError])

  const saveCaptureDataUrl = useCallback(
    async (dataUrl, sourceTitle) => {
      const payload = {
        ocr_text: '',
        image_base64: getRawBase64(dataUrl),
        tag_hint: '',
        source_app: 'desktop',
        source_title: sourceTitle
      }

      setStatus('Saving capture...')
      appLogger.info('capture_save_started', { source_title: sourceTitle })
      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/captures`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify(payload)
        },
        'capture_save',
        {
          source_title: sourceTitle
        }
      )
      if (!res.ok) {
        throw new Error(data?.error || 'unknown error')
      }

      setCaptureResult(data)
      await loadRecentCaptures()
      setActiveTab(TAB_KEYS.CAPTURES)
    },
    [authHeaders, backendURL, loadRecentCaptures]
  )

  const captureAndSaveShortcut = useCallback(async () => {
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
      setStatus('Capturing full screen...')
      appLogger.info('shortcut_capture_started', {
        user_id: authUser?.user_id || '',
        mode: 'full_screen'
      })
      const dataUrl = await window.electronAPI.captureScreen()
      await saveCaptureDataUrl(dataUrl, 'Quick Capture')
      setStatus(showCaptureConfirmation ? CAPTURE_SUCCESS_STATUS : 'Ready')
    } catch (err) {
      appLogger.error('shortcut_capture_failed', {
        error: summarizeError(err)
      })
      reportError('Capture failed', err)
    } finally {
      setIsSavingCapture(false)
    }
  }, [authUser, hasElectronAPI, reportError, saveCaptureDataUrl, showCaptureConfirmation])

  const closeRegionSelector = useCallback(() => {
    setRegionCaptureImage('')
    setRegionSelection(null)
    setSelectionDragStart(null)
  }, [])

  const beginRegionCapture = useCallback(async () => {
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
      setStatus('Preparing region capture...')
      appLogger.info('region_capture_started', {
        user_id: authUser?.user_id || ''
      })

      const captureMethod =
        window.electronAPI.captureScreenForSelection || window.electronAPI.captureScreen
      const dataUrl = await captureMethod()
      if (!dataUrl) {
        setStatus('Capture failed: empty screenshot.')
        return
      }

      setRegionCaptureImage(dataUrl)
      setRegionSelection(null)
      setSelectionDragStart(null)
      setStatus('Drag on the preview to choose a region.')
    } catch (err) {
      appLogger.error('region_capture_failed', {
        error: summarizeError(err)
      })
      reportError('Capture failed', err)
    } finally {
      setIsSavingCapture(false)
    }
  }, [authUser, hasElectronAPI, reportError])

  const onShortcutCapture = useCallback(async () => {
    setStatus('Shortcut triggered.')
    if (autoCaptureOnShortcut) {
      await captureAndSaveShortcut()
      return
    }
    await beginRegionCapture()
  }, [autoCaptureOnShortcut, beginRegionCapture, captureAndSaveShortcut])

  const getPointerInRegionSurface = useCallback((event) => {
    const surface = regionSurfaceRef.current
    if (!surface) {
      return null
    }

    const bounds = surface.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return null
    }

    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height)
    }
  }, [])

  const onRegionPointerDown = useCallback(
    (event) => {
      if (!regionCaptureImage) {
        return
      }

      const point = getPointerInRegionSurface(event)
      if (!point) {
        return
      }

      event.preventDefault()
      if (event.currentTarget?.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }

      setSelectionDragStart(point)
      setRegionSelection({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0
      })
    },
    [getPointerInRegionSurface, regionCaptureImage]
  )

  const onRegionPointerMove = useCallback(
    (event) => {
      if (!selectionDragStart) {
        return
      }

      const point = getPointerInRegionSurface(event)
      if (!point) {
        return
      }

      setRegionSelection(buildSelectionRect(selectionDragStart, point))
    },
    [getPointerInRegionSurface, selectionDragStart]
  )

  const onRegionPointerUp = useCallback(
    (event) => {
      if (!selectionDragStart) {
        return
      }

      const point = getPointerInRegionSurface(event)
      if (point) {
        const nextRect = buildSelectionRect(selectionDragStart, point)
        if (nextRect.width < 8 || nextRect.height < 8) {
          setRegionSelection(null)
        } else {
          setRegionSelection(nextRect)
        }
      }

      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setSelectionDragStart(null)
    },
    [getPointerInRegionSurface, selectionDragStart]
  )

  const onRegionPointerCancel = useCallback(() => {
    setSelectionDragStart(null)
  }, [])

  const onConfirmRegionCapture = useCallback(async () => {
    if (!regionCaptureImage) {
      return
    }

    if (!hasValidRegionSelection || !regionSelection) {
      setStatus('Select a region before saving.')
      return
    }

    const surface = regionSurfaceRef.current
    if (!surface) {
      setStatus('Capture failed: selection surface unavailable.')
      return
    }

    try {
      setIsSavingCapture(true)
      const croppedDataUrl = await cropCapturedArea(regionCaptureImage, regionSelection, {
        width: surface.clientWidth,
        height: surface.clientHeight
      })
      await saveCaptureDataUrl(croppedDataUrl, 'Region Capture')
      closeRegionSelector()
      setStatus(showCaptureConfirmation ? CAPTURE_SUCCESS_STATUS : 'Ready')
    } catch (err) {
      reportError('Capture failed', err)
    } finally {
      setIsSavingCapture(false)
    }
  }, [
    closeRegionSelector,
    hasValidRegionSelection,
    regionCaptureImage,
    regionSelection,
    reportError,
    saveCaptureDataUrl,
    showCaptureConfirmation
  ])

  const onCancelRegionCapture = useCallback(() => {
    closeRegionSelector()
    setStatus('Capture cancelled.')
  }, [closeRegionSelector])

  useEffect(() => {
    if (!isRegionSelectorOpen) {
      return
    }

    function onEscape(event) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onCancelRegionCapture()
    }

    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('keydown', onEscape)
    }
  }, [isRegionSelectorOpen, onCancelRegionCapture])

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
        const { res, data } = await fetchJSONWithLogging(
          `${backendURL}/v1/auth/me`,
          {
            method: 'GET',
            headers: {
              ...authHeaders
            }
          },
          'auth_me'
        )

        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 401 || res.status === 403) {
              appLogger.warn('auth_session_invalidated')
              clearAuthSession()
              setAuthToken('')
              setAuthUser(null)
              setStatus('Session expired. Please sign in again.')
            } else {
              reportError('Session restore failed', data?.error || `request failed (${res.status})`)
            }
          }
          return
        }

        if (!data?.user) {
          if (!cancelled) {
            reportError('Session restore failed', 'Received an invalid auth response from backend.')
          }
          return
        }

        if (!cancelled) {
          appLogger.info('auth_session_restored', {
            user_id: data.user.user_id,
            email: maskEmail(data.user.email)
          })
          setAuthUser(data.user)
          saveAuthSession(authToken, data.user)
        }
      } catch (err) {
        if (!cancelled) {
          appLogger.warn('auth_session_restore_failed', {
            error: summarizeError(err)
          })
          reportError('Session restore failed', err)
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
  }, [authHeaders, authToken, backendURL, reportError])

  useEffect(() => {
    let unsubscribe = () => {}

    async function init() {
      if (!hasElectronAPI) {
        return
      }

      try {
        const appInfo = await window.electronAPI.getAppInfo()
        if (appInfo?.captureShortcut) {
          appLogger.info('app_info_loaded', { capture_shortcut: appInfo.captureShortcut })
          setShortcut(appInfo.captureShortcut)
          setShortcutDraft(appInfo.captureShortcut)
        }
      } catch (err) {
        appLogger.warn('app_info_load_failed', { error: summarizeError(err) })
        reportError('Could not load app info', err)
      }

      const unbindCapture = window.electronAPI.onCaptureShortcut(async () => {
        await onShortcutCapture()
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
  }, [hasElectronAPI, onShortcutCapture, reportError])

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
        const { data } = await fetchJSONWithLogging(
          `${backendURL}/v1/integrations/telegram/me`,
          {
            method: 'GET',
            headers: {
              ...authHeaders
            }
          },
          'telegram_me',
          {
            user_id: authUser?.user_id || ''
          }
        )

        if (!cancelled) {
          const nextStatus = data?.status || 'not_linked'
          appLogger.info('telegram_status_loaded', {
            user_id: authUser?.user_id || '',
            status: nextStatus
          })
          setTelegramLinkStatus(nextStatus)
          if (nextStatus === 'linked') {
            setTelegramEventID('')
          }
        }
      } catch (err) {
        if (!cancelled) {
          appLogger.warn('telegram_status_load_failed', {
            error: summarizeError(err)
          })
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
        const { res, data } = await fetchJSONWithLogging(
          `${backendURL}/v1/integrations/telegram/status?event_id=${encodeURIComponent(telegramEventID)}`,
          {
            method: 'GET',
            headers: {
              ...authHeaders
            }
          },
          'telegram_status_poll',
          {
            event_id: telegramEventID
          }
        )
        if (!res.ok) {
          return
        }

        if (data?.status) {
          setTelegramLinkStatus(data.status)
          if (data.status === 'linked') {
            appLogger.info('telegram_link_completed', {
              event_id: telegramEventID
            })
            setStatus('Telegram linked successfully.')
            await loadRecentCaptures()
          }
        }
      } catch (err) {
        appLogger.debug('telegram_status_poll_failed', {
          event_id: telegramEventID,
          error: summarizeError(err)
        })
        // Keep polling while pending.
      }
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [authHeaders, backendURL, loadRecentCaptures, telegramEventID, telegramLinkStatus])

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

  useEffect(() => {
    if (displayTab === activeTab) {
      return
    }

    let settleTimer = 0
    setTabStage('exit')

    const switchTimer = window.setTimeout(() => {
      setDisplayTab(activeTab)
      setTabStage('enter')
      settleTimer = window.setTimeout(() => {
        setTabStage('idle')
      }, TAB_ENTER_DURATION_MS)
    }, TAB_EXIT_DURATION_MS)

    return () => {
      window.clearTimeout(switchTimer)
      window.clearTimeout(settleTimer)
    }
  }, [activeTab, displayTab])

  useEffect(() => {
    if (displayScreen === targetScreen) {
      return
    }

    let settleTimer = 0
    setScreenStage('exit')

    const switchTimer = window.setTimeout(() => {
      setDisplayScreen(targetScreen)
      setScreenStage('enter')
      settleTimer = window.setTimeout(() => {
        setScreenStage('idle')
      }, SCREEN_ENTER_DURATION_MS)
    }, SCREEN_EXIT_DURATION_MS)

    return () => {
      window.clearTimeout(switchTimer)
      window.clearTimeout(settleTimer)
    }
  }, [displayScreen, targetScreen])

  useEffect(() => {
    function onWindowError(event) {
      if (!event?.error && !event?.message) {
        return
      }

      const location =
        event?.filename && event?.lineno
          ? `${event.filename}:${event.lineno}${event.colno ? `:${event.colno}` : ''}`
          : ''

      reportError('Unexpected app error', event.error || event.message || 'Unexpected app error.', {
        fallbackMessage: 'Unexpected app error.',
        detail: location
      })
    }

    function onUnhandledRejection(event) {
      reportError('Unexpected app error', event.reason || 'Unhandled promise rejection.', {
        fallbackMessage: 'Unhandled promise rejection.'
      })
      event.preventDefault?.()
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [reportError])

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
      appLogger.info('auth_submit_started', {
        mode: authMode,
        email: maskEmail(email)
      })

      const endpoint = authMode === 'register' ? '/v1/auth/register' : '/v1/auth/login'
      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        },
        'auth_submit',
        {
          mode: authMode,
          email: maskEmail(email)
        }
      )
      if (!res.ok || !data?.token || !data?.user) {
        appLogger.warn('auth_submit_rejected', {
          mode: authMode,
          email: maskEmail(email),
          error: data?.error || 'unknown error'
        })
        reportError('Auth failed', data?.error || 'unknown error')
        return
      }

      appLogger.info('auth_submit_succeeded', {
        mode: authMode,
        user_id: data.user.user_id,
        email: maskEmail(data.user.email)
      })
      setAuthToken(data.token)
      setAuthUser(data.user)
      setAuthPassword('')
      setTelegramEventID('')
      setTelegramLinkStatus('checking')
      saveAuthSession(data.token, data.user)
      setStatus(authMode === 'register' ? 'Account created and logged in.' : 'Logged in.')
    } catch (err) {
      appLogger.error('auth_submit_failed', {
        mode: authMode,
        email: maskEmail(email),
        error: summarizeError(err)
      })
      reportError('Auth failed', err)
    } finally {
      setIsAuthenticating(false)
    }
  }

  function onLogout() {
    appLogger.info('auth_logout', {
      user_id: authUser?.user_id || '',
      email: maskEmail(authUser?.email || '')
    })
    clearAuthSession()
    setAuthToken('')
    setAuthUser(null)
    setAuthPassword('')
    setQuestion('')
    setLastAskedQuestion('')
    setIsTelegramSetupOpen(false)
    setTelegramEventID('')
    setTelegramLinkStatus('not_linked')
    setRecentCaptures([])
    setSelectedCaptureID('')
    setSelectedCaptureIDs([])
    captureSelectionAnchorRef.current = ''
    setCaptureResult(null)
    setQueryResult(null)
    setRegionCaptureImage('')
    setRegionSelection(null)
    setSelectionDragStart(null)
    setActiveTab(TAB_KEYS.CAPTURES)
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
      appLogger.info('shortcut_update_started', { shortcut: next })
      const result = await window.electronAPI.updateCaptureShortcut(next)
      if (!result?.ok) {
        appLogger.warn('shortcut_update_rejected', {
          shortcut: next,
          error: result?.error || 'unknown error'
        })
        reportError('Shortcut update failed', result?.error || 'unknown error')
        return
      }

      appLogger.info('shortcut_update_succeeded', { shortcut: result.shortcut })
      setShortcut(result.shortcut)
      setShortcutDraft(result.shortcut)
      setStatus(`Capture shortcut updated to ${result.shortcut}.`)
    } catch (err) {
      appLogger.error('shortcut_update_failed', {
        shortcut: next,
        error: summarizeError(err)
      })
      reportError('Shortcut update failed', err)
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
      appLogger.info('telegram_link_start_requested', {
        user_id: authUser?.user_id || ''
      })

      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/integrations/telegram/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({})
        },
        'telegram_link_start',
        {
          user_id: authUser?.user_id || ''
        }
      )
      if (!res.ok) {
        appLogger.warn('telegram_link_start_rejected', {
          error: data.error || 'unknown error'
        })
        reportError('Telegram integration failed', data?.error || 'unknown error')
        return
      }

      const nextStatus = data.status || 'pending'
      setTelegramEventID(data.event_id || '')
      setTelegramLinkStatus(nextStatus)
      setBotUsername(data.bot_username || '')
      appLogger.info('telegram_link_start_succeeded', {
        user_id: authUser?.user_id || '',
        status: nextStatus,
        event_id: data.event_id || ''
      })

      if (nextStatus === 'linked') {
        setStatus('Telegram is already linked for this account.')
      } else {
        setStatus('Telegram event ID ready. Send it to your bot to complete linking.')
      }
    } catch (err) {
      appLogger.error('telegram_link_start_failed', {
        error: summarizeError(err)
      })
      reportError('Telegram integration failed', err)
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
      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/integrations/telegram/status?event_id=${encodeURIComponent(telegramEventID)}`,
        {
          method: 'GET',
          headers: {
            ...authHeaders
          }
        },
        'telegram_status_check',
        {
          event_id: telegramEventID
        }
      )
      if (!res.ok) {
        reportError('Telegram status check failed', data?.error || 'unknown error')
        return
      }

      if (data?.status) {
        setTelegramLinkStatus(data.status)
        if (data.status === 'linked') {
          setStatus('Telegram linked successfully.')
        } else {
          setStatus(`Current Telegram status: ${data.status}`)
        }
      }
    } catch (err) {
      appLogger.error('telegram_status_check_failed', {
        event_id: telegramEventID,
        error: summarizeError(err)
      })
      reportError('Telegram status check failed', err)
    } finally {
      setIsCheckingTelegramLink(false)
    }
  }

  async function onDisconnectTelegram() {
    if (!authUser) {
      setStatus('Please log in to manage Telegram integration.')
      return
    }

    try {
      setIsDisconnectingTelegram(true)
      setStatus('Disconnecting Telegram...')
      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/integrations/telegram/disconnect`,
        {
          method: 'POST',
          headers: {
            ...authHeaders
          }
        },
        'telegram_disconnect',
        {
          user_id: authUser?.user_id || ''
        }
      )
      if (!res.ok) {
        reportError('Telegram disconnect failed', data?.error || 'unknown error')
        return
      }

      appLogger.info('telegram_disconnect_succeeded', {
        user_id: authUser?.user_id || '',
        disconnected: Boolean(data?.disconnected)
      })
      setTelegramEventID('')
      setTelegramLinkStatus('not_linked')
      setStatus(data?.disconnected ? 'Telegram disconnected.' : 'Telegram was already disconnected.')
    } catch (err) {
      appLogger.error('telegram_disconnect_failed', {
        error: summarizeError(err)
      })
      reportError('Telegram disconnect failed', err)
    } finally {
      setIsDisconnectingTelegram(false)
    }
  }

  async function submitRecallQuestion(rawQuestion) {
    if (!authUser) {
      setStatus('Please log in to ask SnapRecall.')
      return
    }

    const normalizedQuestion = String(rawQuestion || '').trim()
    if (!normalizedQuestion) {
      setStatus('Enter a question first.')
      return
    }

    try {
      setIsAsking(true)
      setStatus('Asking SnapRecall...')
      appLogger.info('recall_question_started', {
        user_id: authUser?.user_id || '',
        question: normalizedQuestion
      })

      const { res, data } = await fetchJSONWithLogging(
        `${backendURL}/v1/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            question: normalizedQuestion
          })
        },
        'recall_question',
        {
          user_id: authUser?.user_id || ''
        }
      )
      if (!res.ok) {
        reportError('Ask failed', data?.error || 'unknown error')
        return
      }

      appLogger.info('recall_question_succeeded', {
        user_id: authUser?.user_id || '',
        source_capture_id: data?.source_capture_id || '',
        confidence: data?.confidence
      })
      setQueryResult(data)
      setLastAskedQuestion(normalizedQuestion)
      setQuestion('')
      setStatus('Answer ready.')
      setActiveTab(TAB_KEYS.RECALL)
    } catch (err) {
      appLogger.error('recall_question_failed', {
        user_id: authUser?.user_id || '',
        error: summarizeError(err)
      })
      reportError('Ask failed', err)
    } finally {
      setIsAsking(false)
    }
  }

  async function onAsk(event) {
    event.preventDefault()
    await submitRecallQuestion(question)
  }

  async function onAskSuggestion(nextQuestion) {
    setQuestion(nextQuestion)
    await submitRecallQuestion(nextQuestion)
  }

  async function onCopyEventID() {
    if (!telegramEventID) {
      return false
    }

    try {
      await navigator.clipboard.writeText(telegramEventID)
      appLogger.info('telegram_event_id_copied', { event_id: telegramEventID })
      setStatus('Event ID copied.')
      return true
    } catch (err) {
      appLogger.warn('telegram_event_id_copy_failed', {
        error: summarizeError(err)
      })
      setStatus('Copy failed. You can copy the code manually.')
      return false
    }
  }

  function openTelegramSetup() {
    if (!authUser) {
      setStatus('Please log in to connect Telegram.')
      return
    }

    setIsTelegramSetupOpen(true)
    if (!isTelegramLinked && !isTelegramLinkPending && !isStartingTelegramLink) {
      void onStartTelegramLink()
    }
  }

  function closeTelegramSetup() {
    setIsTelegramSetupOpen(false)
  }

  function onCompleteTelegramSetup() {
    setIsTelegramSetupOpen(false)
    setStatus('Telegram setup saved.')
  }

  const onToggleCaptureSelection = useCallback(
    (captureID, checked, options = {}) => {
      const shouldSelectRange = Boolean(options.shiftKey)
      const anchorCaptureID = captureSelectionAnchorRef.current

      setSelectedCaptureIDs((prev) => {
        const next = new Set(prev)
        const canUseRange =
          shouldSelectRange &&
          anchorCaptureID &&
          anchorCaptureID !== captureID &&
          filteredCaptures.some((record) => record.id === anchorCaptureID)

        if (canUseRange) {
          const startIndex = filteredCaptures.findIndex((record) => record.id === anchorCaptureID)
          const endIndex = filteredCaptures.findIndex((record) => record.id === captureID)
          if (startIndex !== -1 && endIndex !== -1) {
            const [fromIndex, toIndex] =
              startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
            filteredCaptures.slice(fromIndex, toIndex + 1).forEach((record) => {
              if (checked) {
                next.add(record.id)
              } else {
                next.delete(record.id)
              }
            })
          }
        } else if (checked) {
          next.add(captureID)
        } else {
          next.delete(captureID)
        }

        const nextSelection = Array.from(next)
        if (!nextSelection.length) {
          captureSelectionAnchorRef.current = ''
        } else if (!shouldSelectRange || !anchorCaptureID) {
          captureSelectionAnchorRef.current = captureID
        }
        return nextSelection
      })

      setSelectedCaptureID(captureID)
    },
    [filteredCaptures]
  )

  const onToggleSelectAllVisible = useCallback(
    (checked) => {
      const visibleCaptureIDs = filteredCaptures.map((record) => record.id)
      setSelectedCaptureIDs((prev) => {
        const next = new Set(prev)
        if (checked) {
          visibleCaptureIDs.forEach((captureID) => next.add(captureID))
        } else {
          visibleCaptureIDs.forEach((captureID) => next.delete(captureID))
        }

        const nextSelection = Array.from(next)
        if (!nextSelection.length) {
          captureSelectionAnchorRef.current = ''
        } else if (checked && visibleCaptureIDs.length) {
          captureSelectionAnchorRef.current = visibleCaptureIDs[0]
        }
        return nextSelection
      })
    },
    [filteredCaptures]
  )

  const onClearCaptureSelection = useCallback(() => {
    captureSelectionAnchorRef.current = ''
    setSelectedCaptureIDs([])
  }, [])

  const onCaptureRowClick = useCallback(
    (event, captureID) => {
      if (event.shiftKey) {
        event.preventDefault()
        onToggleCaptureSelection(captureID, true, { shiftKey: true })
        return
      }

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault()
        const checked = selectedCaptureIDsSet.has(captureID)
        onToggleCaptureSelection(captureID, !checked)
        return
      }

      captureSelectionAnchorRef.current = captureID
      setSelectedCaptureID(captureID)
    },
    [onToggleCaptureSelection, selectedCaptureIDsSet]
  )

  useEffect(() => {
    if (!showWorkspace || displayTab !== TAB_KEYS.CAPTURES) {
      return
    }

    function onCaptureSelectionKeydown(event) {
      const target = event.target
      const tagName = String(target?.tagName || '').toLowerCase()
      const isInputTarget =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable)
      if (isInputTarget) {
        return
      }

      const pressedKey = String(event.key || '').toLowerCase()

      if ((event.metaKey || event.ctrlKey) && pressedKey === 'a') {
        if (!filteredCaptures.length) {
          return
        }

        event.preventDefault()
        const shouldSelectVisible = !allVisibleCapturesSelected || hasPartialVisibleCaptureSelection
        onToggleSelectAllVisible(shouldSelectVisible)
        if (shouldSelectVisible) {
          setStatus(`Selected ${filteredCaptures.length} visible captures.`)
        } else {
          setStatus('Cleared visible capture selection.')
        }
        return
      }

      if (pressedKey === 'escape' && selectedCaptureIDs.length) {
        event.preventDefault()
        onClearCaptureSelection()
        setStatus('Capture selection cleared.')
      }
    }

    window.addEventListener('keydown', onCaptureSelectionKeydown)
    return () => {
      window.removeEventListener('keydown', onCaptureSelectionKeydown)
    }
  }, [
    allVisibleCapturesSelected,
    displayTab,
    filteredCaptures.length,
    hasPartialVisibleCaptureSelection,
    onClearCaptureSelection,
    onToggleSelectAllVisible,
    selectedCaptureIDs.length,
    showWorkspace
  ])

  async function onDeleteSelectedCapture() {
    const targetCaptureIDs = deleteTargetCaptureIDs
    if (!targetCaptureIDs.length) {
      return
    }

    const confirmationRecord =
      targetCaptureIDs.length === 1
        ? recentCaptures.find((record) => record.id === targetCaptureIDs[0]) || selectedCapture
        : null
    const confirmationLabel =
      targetCaptureIDs.length === 1
        ? `"${extractTitle(confirmationRecord)}"`
        : `${targetCaptureIDs.length} selected captures`
    const confirmed = window.confirm(`Delete ${confirmationLabel}? This cannot be undone.`)
    if (!confirmed) {
      return
    }

    try {
      setIsDeletingCapture(true)
      setStatus(targetCaptureIDs.length > 1 ? `Deleting ${targetCaptureIDs.length} captures...` : 'Deleting capture...')
      appLogger.info('capture_delete_started', {
        user_id: authUser?.user_id || '',
        capture_count: targetCaptureIDs.length
      })

      const deletedCaptureIDs = []
      const failedDeletes = []

      for (const captureID of targetCaptureIDs) {
        try {
          const { res, data } = await fetchJSONWithLogging(
            `${backendURL}/v1/captures/${encodeURIComponent(captureID)}`,
            {
              method: 'DELETE',
              headers: {
                ...authHeaders
              }
            },
            'capture_delete',
            {
              capture_id: captureID,
              user_id: authUser?.user_id || ''
            }
          )
          if (!res.ok) {
            failedDeletes.push(data?.error || `request failed (${res.status})`)
            continue
          }
          deletedCaptureIDs.push(captureID)
        } catch (err) {
          failedDeletes.push(formatFetchError(err, backendURL))
        }
      }

      if (!deletedCaptureIDs.length) {
        const firstFailure = failedDeletes[0] || 'unknown error'
        appLogger.warn('capture_delete_rejected', {
          user_id: authUser?.user_id || '',
          error: firstFailure
        })
        reportError('Delete failed', firstFailure)
        return
      }

      const deletedCaptureIDsSet = new Set(deletedCaptureIDs)

      setRecentCaptures((prev) => prev.filter((record) => !deletedCaptureIDsSet.has(record.id)))
      setSelectedCaptureIDs((prev) => {
        const nextSelection = prev.filter((captureID) => !deletedCaptureIDsSet.has(captureID))
        if (!nextSelection.length) {
          captureSelectionAnchorRef.current = ''
        }
        return nextSelection
      })
      setSelectedCaptureID((prev) => (deletedCaptureIDsSet.has(prev) ? '' : prev))

      if (captureResult?.capture_id && deletedCaptureIDsSet.has(captureResult.capture_id)) {
        setCaptureResult(null)
      }
      if (queryResult?.source_capture_id && deletedCaptureIDsSet.has(queryResult.source_capture_id)) {
        setQueryResult(null)
        setLastAskedQuestion('')
      }

      await loadRecentCaptures()
      appLogger.info('capture_delete_succeeded', {
        user_id: authUser?.user_id || '',
        deleted_count: deletedCaptureIDs.length,
        failed_count: failedDeletes.length
      })

      if (failedDeletes.length) {
        setStatus(`Deleted ${deletedCaptureIDs.length}. Failed ${failedDeletes.length}.`)
      } else if (deletedCaptureIDs.length > 1) {
        setStatus(`Deleted ${deletedCaptureIDs.length} captures.`)
      } else {
        setStatus('Capture deleted.')
      }
    } catch (err) {
      appLogger.error('capture_delete_failed', {
        user_id: authUser?.user_id || '',
        error: summarizeError(err)
      })
      reportError('Delete failed', err)
    } finally {
      setIsDeletingCapture(false)
    }
  }

  function renderErrorPopup() {
    if (!errorPopup) {
      return null
    }

    const isBackendError = errorPopup.kind === 'backend'

    return (
      <div className="error-popup-stack" aria-live="assertive" aria-atomic="true">
        <section className={`error-popup-card kind-${errorPopup.kind}`} role="alert">
          <div className="error-popup-head">
            <div className="error-popup-copy">
              <span className="error-popup-label">
                {isBackendError ? 'Backend connection issue' : 'Something went wrong'}
              </span>
              <h2>{errorPopup.title}</h2>
            </div>
            <button type="button" className="error-popup-dismiss" onClick={dismissErrorPopup}>
              Dismiss
            </button>
          </div>
          <p className="error-popup-message">{errorPopup.message}</p>
          {errorPopup.detail ? <p className="error-popup-detail">{errorPopup.detail}</p> : null}
          <div className="error-popup-footer">
            <span>
              {isBackendError
                ? 'Start or reconnect the backend, then try the action again.'
                : 'Review the message above, then retry when ready.'}
            </span>
          </div>
        </section>
      </div>
    )
  }

  function renderLoadingScreen() {
    return (
      <div className="screen-frame">
        <div className="loading-shell">
          <div className="loading-orb" />
          <h1 className="text-reveal text-delay-1">Loading SnapRecall</h1>
          <p className="text-reveal text-delay-2">Syncing your session and latest captures.</p>
          <div className="loading-progress">
            <span />
          </div>
        </div>
      </div>
    )
  }

  function renderGlobalLoader() {
    if (!loadingMessage || displayScreen === 'loading') {
      return null
    }

    return (
      <div className="global-loader" role="status" aria-live="polite">
        <span className="global-loader-spinner" aria-hidden="true" />
        <span className="global-loader-copy" key={loadingMessage}>
          {loadingMessage}
        </span>
      </div>
    )
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
              <h2 className="text-reveal text-delay-1">SnapRecall</h2>
              <p className="text-reveal text-delay-2">
                Capture in 1 second. Recall in 1 second. Your AI-powered screenshot memory.
              </p>
              <div className="brand-tags">
                <span>AI Extraction</span>
                <span>Telegram Sync</span>
                <span>Instant Recall</span>
              </div>
            </div>
          </aside>

          <section className="login-panel">
            <h1 className="text-reveal text-delay-1">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p className="text-reveal text-delay-2">
              {isRegister ? 'Sign up to start saving captures' : 'Sign in to access your captures'}
            </p>

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

  function renderCaptureRows() {
    if (isLoadingCaptures) {
      return (
        <div className="history-skeleton-list" aria-live="polite" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={`capture-skeleton-${index}`} className="history-skeleton-row">
              <span className="skeleton-dot" />
              <div className="skeleton-lines">
                <span className="skeleton-line skeleton-line-long" />
                <span className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (!filteredCaptures.length) {
      return (
        <div className="history-empty">
          <strong>No captures yet.</strong>
          <p>Capture now to start building your memory timeline.</p>
        </div>
      )
    }

    return filteredCaptures.map((record, index) => {
      const tag = extractTag(record)
      const active = selectedCapture?.id === record.id
      const checked = selectedCaptureIDsSet.has(record.id)
      const title = extractTitle(record)
      return (
        <div key={record.id} className={`history-row-shell ${checked ? 'checked' : ''} ${active ? 'active' : ''}`}>
          <label className="history-row-checkbox" aria-label={`Select ${title}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onToggleCaptureSelection(record.id, event.target.checked, {
                  shiftKey: Boolean(event.nativeEvent?.shiftKey || event.shiftKey)
                })
              }
            />
          </label>
          <button
            type="button"
            className={`history-row ${active ? 'active' : ''}`}
            onClick={(event) => onCaptureRowClick(event, record.id)}
            aria-current={active ? 'true' : undefined}
            aria-pressed={checked}
            style={{ '--row-delay': `${index * 40}ms` }}
          >
            <div className="history-icon-wrap">
              <img src={getTagIcon(tag)} alt="" />
            </div>
            <div className="history-content">
              <div className="history-top">
                <h3>{title}</h3>
                <span className="tag-pill">{tag}</span>
              </div>
              <p>
                {record.fields?.length || 1} facts · {confidenceLabel(record.fields)} · {formatCaptureDate(record.captured_at)}
              </p>
            </div>
            <img src={ICONS.rowExpand} alt="" className="row-expand" />
          </button>
        </div>
      )
    })
  }

  function renderCaptureDetails() {
    const record = selectedCapture
    if (!record) {
      return (
        <div className="capture-focus-empty">
          <strong>Select a capture</strong>
          <p>Pick an item from the list to review its summary and extracted facts.</p>
        </div>
      )
    }

    const tag = extractTag(record)
    const sourceTitle = record.source?.title || 'Captured screen'
    const fields = Array.isArray(record.fields) ? record.fields : []
    const summary =
      typeof record.summary === 'string' && record.summary.trim()
        ? record.summary.trim()
        : 'No summary available for this capture yet.'
    const visibleFields = fields.slice(0, 8)

    return (
      <div className="capture-focus-content">
        <div className="capture-focus-head">
          <div>
            <p className="capture-focus-label">{tag}</p>
            <h2>{extractTitle(record)}</h2>
          </div>
          <span>{formatCaptureDate(record.captured_at)}</span>
        </div>

        <div className="capture-focus-badges">
          <span>{fields.length || 1} facts</span>
          <span>{confidenceLabel(fields)}</span>
        </div>

        <section className="capture-focus-section">
          <h3>Summary</h3>
          <p>{summary}</p>
        </section>

        <section className="capture-focus-section">
          <h3>Source</h3>
          <p>{sourceTitle}</p>
        </section>

        <section className="capture-focus-section">
          <h3>Extracted facts</h3>
          {visibleFields.length ? (
            <ul className="capture-facts-list">
              {visibleFields.map((field, index) => {
                const fieldLabel =
                  typeof field?.type === 'string' && field.type.trim() ? field.type.trim() : `Fact ${index + 1}`
                const fieldValue =
                  typeof field?.value === 'string' && field.value.trim() ? field.value.trim() : 'No value'
                const fieldConfidence =
                  typeof field?.confidence === 'number' ? `${Math.round(field.confidence * 100)}% confidence` : null

                return (
                  <li key={`${record.id}-${fieldLabel}-${index}`}>
                    <div>
                      <b>{fieldLabel}</b>
                      {fieldConfidence ? <small>{fieldConfidence}</small> : null}
                    </div>
                    <p>{fieldValue}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="capture-facts-empty">No structured fields extracted for this capture.</p>
          )}
          {fields.length > visibleFields.length ? (
            <small className="capture-facts-more">Showing first {visibleFields.length} facts.</small>
          ) : null}
        </section>
      </div>
    )
  }

  function renderDashboardTab() {
    return (
      <div className="workspace-content dashboard-view">
        <div className="dashboard-head">
          <h1 className="text-reveal text-delay-1">{dashboardGreeting}</h1>
          <p className="text-reveal text-delay-2">{dashboardSubtitle}</p>
        </div>

        <div className="dashboard-metrics-grid">
          {dashboardStats.map((item) => (
            <article key={item.key} className="dashboard-metric-card">
              <div className="dashboard-metric-card-head">
                <img src={item.icon} alt="" />
                <img src={ICONS.dashboardMetricTrend} alt="" />
              </div>
              <strong>{item.value}</strong>
              <p>{item.label}</p>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>

        {renderTelegramIntegrationBanner()}

        <div className="dashboard-actions-grid">
          <button
            type="button"
            className="dashboard-action-card primary"
            onClick={beginRegionCapture}
            disabled={isSavingCapture || isRegionSelectorOpen}
          >
            <img src={ICONS.dashboardActionCapture} alt="" className="dashboard-action-icon" />
            <strong>{isSavingCapture ? 'Preparing Capture...' : 'New Capture'}</strong>
            <p>Screenshot and extract facts</p>
            <img src={ICONS.dashboardActionArrow} alt="" className="dashboard-action-arrow" />
          </button>

          <button
            type="button"
            className="dashboard-action-card"
            onClick={() => setActiveTab(TAB_KEYS.RECALL)}
            disabled={isAsking}
          >
            <img src={ICONS.dashboardActionRecall} alt="" className="dashboard-action-icon" />
            <strong>{isTelegramLinked ? 'Ask Telegram' : 'Open Recall'}</strong>
            <p>{isTelegramLinked ? 'Recall any captured info' : 'Query your saved captures'}</p>
            <img src={ICONS.dashboardActionArrow} alt="" className="dashboard-action-arrow" />
          </button>
        </div>

        <section className="dashboard-recent-section">
          <div className="dashboard-recent-head">
            <h2>Recent Captures</h2>
            <button type="button" onClick={() => setActiveTab(TAB_KEYS.CAPTURES)}>
              View all
            </button>
          </div>

          <div className="dashboard-recent-list">
            {!dashboardRecentCaptures.length ? (
              <div className="dashboard-recent-empty">
                <strong>No captures yet.</strong>
                <p>Take your first capture to start building your recall timeline.</p>
              </div>
            ) : (
              dashboardRecentCaptures.map((record) => {
                const tag = extractTag(record)
                const visual = getDashboardRecentVisual(tag)
                const factsExtracted = Array.isArray(record?.fields) && record.fields.length ? record.fields.length : 1

                return (
                  <button
                    key={`dashboard-${record.id}`}
                    type="button"
                    className="dashboard-recent-row"
                    onClick={() => {
                      setSelectedCaptureID(record.id)
                      setActiveTab(TAB_KEYS.CAPTURES)
                    }}
                  >
                    <span className={`dashboard-recent-icon tone-${visual.tone}`}>
                      <img src={visual.icon} alt="" />
                    </span>
                    <span className="dashboard-recent-copy">
                      <strong>{extractTitle(record)}</strong>
                      <small>{factsExtracted} facts extracted</small>
                    </span>
                    <span className="dashboard-recent-time">{formatRelativeCaptureTime(record.captured_at)}</span>
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>
    )
  }

  function renderRegionCaptureSelector() {
    if (!isRegionSelectorOpen) {
      return null
    }

    return (
      <div className="region-picker-overlay" role="dialog" aria-modal="true" aria-label="Select capture region">
        <div className="region-picker-card">
          <div className="region-picker-head">
            <div>
              <h2>Select region to save</h2>
              <p>Drag on the screenshot to choose the area for this capture.</p>
            </div>
            <button
              type="button"
              className="region-picker-cancel"
              onClick={onCancelRegionCapture}
              disabled={isSavingCapture}
            >
              Cancel
            </button>
          </div>

          <div className="region-picker-stage">
            <div
              ref={regionSurfaceRef}
              className={`region-picker-surface ${selectionDragStart ? 'dragging' : ''}`}
              onPointerDown={onRegionPointerDown}
              onPointerMove={onRegionPointerMove}
              onPointerUp={onRegionPointerUp}
              onPointerCancel={onRegionPointerCancel}
            >
              <img
                src={regionCaptureImage}
                alt="Screen capture preview for region selection"
                className="region-picker-image"
                draggable={false}
              />
              {regionSelection ? (
                <div
                  className="region-picker-selection"
                  style={{
                    left: `${regionSelection.x}px`,
                    top: `${regionSelection.y}px`,
                    width: `${regionSelection.width}px`,
                    height: `${regionSelection.height}px`
                  }}
                >
                  <span>{`${Math.round(regionSelection.width)} x ${Math.round(regionSelection.height)}`}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="region-picker-actions">
            <span>{hasValidRegionSelection ? 'Selection ready.' : 'Click and drag to select an area.'}</span>
            <button
              type="button"
              className="primary-gradient region-picker-save"
              onClick={onConfirmRegionCapture}
              disabled={!hasValidRegionSelection || isSavingCapture}
            >
              {isSavingCapture ? 'Saving...' : 'Save selection'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderTelegramIntegrationBanner() {
    if (isTelegramLinked) {
      return null
    }
    const setupLabel = isStartingTelegramLink
      ? 'Preparing...'
      : isTelegramLinkPending
        ? 'Continue setup'
        : 'Connect Telegram'
    const bannerCopy = isTelegramLinkPending
      ? `Open ${telegramBotHandle}, send your verification code, and SnapRecall will link automatically.`
      : 'Connect your Telegram to ask natural language questions like "When is my exam?" or "What\'s my flight number?" and get instant answers from your captured screenshots, anywhere.'

    return (
      <section className={`telegram-integration-banner ${isTelegramLinkPending ? 'is-pending' : ''}`}>
        <div className="telegram-integration-note">
          <div className="telegram-integration-icon">
            <img src={ICONS.telegramNotice} alt="" />
          </div>
          <div className="telegram-integration-copy">
            <h2>{isTelegramLinkPending ? 'Finish Connecting Telegram' : 'Unlock Instant Recall via Telegram'}</h2>
            <p>{bannerCopy}</p>
            <div className="telegram-integration-actions">
              <button
                type="button"
                className="telegram-integration-cta"
                onClick={openTelegramSetup}
                disabled={isStartingTelegramLink || isCheckingTelegramLink || isDisconnectingTelegram}
              >
                <img src={ICONS.telegramNoticeLink} alt="" />
                <span>{setupLabel}</span>
              </button>
              <span className="telegram-integration-meta">
                {isTelegramLinkPending ? 'Verification code ready' : 'Takes ~30 seconds'}
              </span>
            </div>
          </div>
        </div>
      </section>
    )
  }

  function renderCapturesTab(titleText) {
    return (
      <div className="workspace-content">
        <div className="captures-header-row">
          <div>
            <h1 className="text-reveal text-delay-1">{titleText}</h1>
            <p className="text-reveal text-delay-2">
              {captureCount} captures · {factsCount} facts extracted
            </p>
          </div>
          <div className="captures-toolbar-actions">
            <button
              type="button"
              className="primary-gradient capture-main-cta"
              onClick={beginRegionCapture}
              disabled={isSavingCapture || isRegionSelectorOpen}
            >
              <span>{captureNowLabel}</span>
            </button>
            <button
              type="button"
              className="danger-ghost capture-delete-inline"
              onClick={onDeleteSelectedCapture}
              disabled={!deleteTargetCaptureIDs.length || isDeletingCapture}
            >
              {isDeletingCapture
                ? 'Deleting...'
                : deleteTargetCaptureIDs.length > 1
                  ? `Delete selected (${deleteTargetCaptureIDs.length})`
                  : selectedCaptureIDs.length === 1
                    ? 'Delete selected'
                    : 'Delete focused'}
            </button>
          </div>
        </div>

        <div className="captures-toolbar-meta">
          <div className="shortcut-inline">
            <kbd>⌘</kbd>
            <span>+</span>
            <kbd>⇧</kbd>
            <span>+</span>
            <kbd>S</kbd>
            <small>global shortcut</small>
          </div>
          <small>
            {selectedCapture ? `Focused: ${extractTitle(selectedCapture)}` : 'No capture selected'}
            {selectedCaptureIDs.length ? ` · ${selectedCaptureIDs.length} selected` : ''}
          </small>
        </div>

        <div className="captures-content-grid">
          <section className="captures-list-panel">
            <div className="search-row">
              <label className="search-input">
                <img src={ICONS.search} alt="" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search title, tag, source, summary..."
                />
              </label>
              <span className="search-results-count">{filteredCaptures.length} shown</span>
            </div>
            <div className="capture-selection-toolbar" role="status" aria-live="polite">
              <div className="capture-selection-copy">
                <strong>{selectedCaptureIDs.length ? `${selectedCaptureIDs.length} selected` : 'No captures selected'}</strong>
                <small>
                  {filteredCaptures.length
                    ? `${selectedVisibleCaptureCount}/${filteredCaptures.length} in this view`
                    : 'No captures in this view'}
                  {selectedHiddenCaptureCount ? ` · ${selectedHiddenCaptureCount} outside current filter` : ''}
                </small>
              </div>
              <div className="capture-selection-actions">
                <button
                  type="button"
                  className={`selection-action ${allVisibleCapturesSelected ? 'active' : ''}`}
                  onClick={() => onToggleSelectAllVisible(!allVisibleCapturesSelected)}
                  disabled={!filteredCaptures.length}
                >
                  {allVisibleCapturesSelected ? 'Unselect visible' : 'Select visible'}
                </button>
                <button
                  type="button"
                  className="selection-action"
                  onClick={onClearCaptureSelection}
                  disabled={!selectedCaptureIDs.length}
                >
                  Clear all
                </button>
              </div>
            </div>
            <p className="capture-selection-tip">
              Tip: Shift-click for range select. Cmd/Ctrl-click to toggle individual rows.
            </p>
            <div className="history-list">{renderCaptureRows()}</div>
          </section>

          <section className="captures-detail-panel">{renderCaptureDetails()}</section>
        </div>
      </div>
    )
  }

  function renderRecallTab() {
    const hasAnswer = Boolean(queryResult?.answer)

    return (
      <div className="recall-shell">
        <div className="recall-head">
          <div className="recall-head-avatar">
            <img src={ICONS.recallBot} alt="" />
          </div>
          <div className="recall-head-meta">
            <strong>SnapRecall Bot</strong>
            <span>online</span>
          </div>
        </div>

        <div className="recall-body">
          {hasAnswer ? (
            <div className="recall-thread">
              {lastAskedQuestion ? (
                <div className="recall-message recall-message-user">
                  <p>{lastAskedQuestion}</p>
                </div>
              ) : null}
              <div className="recall-message recall-message-bot">
                <p className="text-echo" key={queryResult.answer}>
                  {queryResult.answer}
                </p>
                {queryResult.source_capture_id ? <small>Source: {queryResult.source_capture_id}</small> : null}
              </div>
            </div>
          ) : (
            <div className="recall-empty">
              <div className="recall-empty-icon">
                <img src={ICONS.recallFocus} alt="" />
              </div>
              <p>Ask me anything about your captured screenshots</p>
              <div className="recall-suggestions">
                {RECALL_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      void onAskSuggestion(suggestion)
                    }}
                    disabled={isAsking}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onAsk} className="recall-composer">
          <div className="recall-composer-row">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your screenshots..."
            />
            <button type="submit" className="recall-send" aria-label="Send recall query" disabled={isAsking}>
              <img src={ICONS.recallSend} alt="" />
            </button>
          </div>
        </form>
      </div>
    )
  }

  function renderSettingsTab() {
    const telegramPending = isTelegramLinkPending
    const telegramConnected = isTelegramLinked
    const telegramStatusTitle = telegramConnected ? 'Bot connected' : telegramPending ? 'Link pending' : 'Bot not connected'
    const telegramStatusDescription = telegramConnected
      ? `${telegramBotHandle} · Linked to ${linkedTelegramAccountLabel} for mobile updates`
      : telegramPending
        ? `Finish linking ${telegramBotHandle} from the setup flow to unlock mobile recall`
        : `Optional: connect ${telegramBotHandle} to sync captures and ask questions from Telegram`
    const telegramSetupLabel = isStartingTelegramLink
      ? 'Preparing...'
      : telegramConnected
        ? 'Manage'
        : telegramPending
          ? 'Resume setup'
          : 'Connect'

    return (
      <div className="workspace-content settings-view">
        <div className="settings-shell">
          <div className="settings-head text-reveal text-delay-1">
            <h1>Settings</h1>
            <p>Configure your SnapRecall preferences</p>
          </div>

          <div className="settings-section-stack">
            <section className="settings-node-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsAccount} alt="" />
                <h3>Account</h3>
              </div>

              <div className="settings-account-row">
                <div className="settings-account-identity">
                  <span className="settings-account-avatar">
                    <img src={ICONS.settingsAccountAvatar} alt="" />
                  </span>
                  <span className="settings-account-meta">
                    <strong>{displayName}</strong>
                    <small>{authUser?.email}</small>
                  </span>
                </div>

                <button
                  type="button"
                  className="settings-outline-btn"
                  onClick={() => setStatus('Profile editing is not available yet.')}
                >
                  Edit Profile
                </button>
              </div>
            </section>

            <section className="settings-node-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsKeyboard} alt="" />
                <h3>Keyboard Shortcut</h3>
              </div>

              <div className="settings-shortcut-row">
                <p>Capture shortcut</p>
                <div className="settings-shortcut-kbd-row">
                  {shortcutTokens.map((token, index) => (
                    <div key={`shortcut-token-${token}-${index}`} className="settings-shortcut-token-pair">
                      {index > 0 ? <span className="settings-shortcut-plus">+</span> : null}
                      <kbd>{token}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              <form
                className="settings-shortcut-editor"
                onSubmit={(event) => {
                  event.preventDefault()
                  void onSaveShortcut()
                }}
              >
                <input
                  value={shortcutDraft}
                  onChange={(event) => setShortcutDraft(event.target.value)}
                  placeholder="CommandOrControl+Shift+S"
                />
                <button type="submit" disabled={isUpdatingShortcut}>
                  {isUpdatingShortcut ? 'Saving...' : 'Save'}
                </button>
              </form>
            </section>

            <section className="settings-node-card settings-telegram-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsTelegram} alt="" />
                <h3>Telegram Integration</h3>
              </div>

              <div className="settings-telegram-status-row">
                <div className="settings-row-meta">
                  <strong>{telegramStatusTitle}</strong>
                  <small>{telegramStatusDescription}</small>
                </div>

                <div className="settings-telegram-actions">
                  {telegramConnected ? (
                    <div className="settings-connected-chip">
                      <img src={ICONS.settingsConnectedCheck} alt="" />
                      <span>Connected</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="settings-outline-btn settings-connect-btn"
                    onClick={openTelegramSetup}
                    disabled={isStartingTelegramLink || isCheckingTelegramLink || isDisconnectingTelegram}
                  >
                    {telegramSetupLabel}
                  </button>
                </div>
              </div>

              {telegramPending ? (
                <div className="settings-telegram-hint">
                  <span className="dot off" />
                  <small>Verification code is ready. Open setup to finish linking inside Telegram.</small>
                </div>
              ) : null}

              {!telegramConnected ? (
                <div className="settings-telegram-hint secondary">
                  <span className="dot off" />
                  <small>Setup takes about 30 seconds and gives you instant recall from your phone.</small>
                </div>
              ) : null}

              <div className="settings-toggle-row">
                <span>Auto-sync captures</span>
                <button
                  type="button"
                  className={`settings-toggle ${autoSyncCaptures ? 'on' : ''}`}
                  onClick={() => setAutoSyncCaptures((prev) => !prev)}
                  aria-pressed={autoSyncCaptures}
                  disabled={!telegramConnected}
                >
                  <span />
                </button>
              </div>

              <div className="settings-toggle-row two-line">
                <span className="settings-row-meta">
                  <strong>Include source screenshot</strong>
                  <small>Attach the original screenshot image alongside extracted facts</small>
                </span>
                <button
                  type="button"
                  className={`settings-toggle ${telegramIncludeSourceScreenshot ? 'on' : ''}`}
                  onClick={() => setTelegramIncludeSourceScreenshot((prev) => !prev)}
                  aria-pressed={telegramIncludeSourceScreenshot}
                  disabled={!telegramConnected}
                >
                  <span />
                </button>
              </div>

              <div className="settings-toggle-row two-line">
                <span className="settings-row-meta">
                  <strong>{`Q&A mode`}</strong>
                  <small>Ask natural language questions in Telegram</small>
                </span>
                <button
                  type="button"
                  className={`settings-toggle ${telegramQAMode ? 'on' : ''}`}
                  onClick={() => setTelegramQAMode((prev) => !prev)}
                  aria-pressed={telegramQAMode}
                  disabled={!telegramConnected}
                >
                  <span />
                </button>
              </div>

              <div className="settings-toggle-row two-line">
                <span className="settings-row-meta">
                  <strong>Daily digest</strong>
                  <small>Receive a daily summary of upcoming events from your captures</small>
                </span>
                <button
                  type="button"
                  className={`settings-toggle ${telegramDailyDigest ? 'on' : ''}`}
                  onClick={() => setTelegramDailyDigest((prev) => !prev)}
                  aria-pressed={telegramDailyDigest}
                  disabled={!telegramConnected}
                >
                  <span />
                </button>
              </div>

              <div className="settings-card-divider">
                <button
                  type="button"
                  className="settings-danger-link"
                  disabled={!telegramConnected || isDisconnectingTelegram}
                  onClick={onDisconnectTelegram}
                >
                  <img src={ICONS.settingsDisconnect} alt="" />
                  <span>{isDisconnectingTelegram ? 'Disconnecting...' : 'Disconnect Telegram'}</span>
                </button>
              </div>
            </section>

            <section className="settings-node-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsPrivacy} alt="" />
                <h3>{`Privacy & Processing`}</h3>
              </div>

              <div className="settings-toggle-row two-line">
                <span className="settings-row-meta">
                  <strong>Auto-capture on shortcut</strong>
                  <small>Skip region selection, capture full screen</small>
                </span>
                <button
                  type="button"
                  className={`settings-toggle ${autoCaptureOnShortcut ? 'on' : ''}`}
                  onClick={() => setAutoCaptureOnShortcut((prev) => !prev)}
                  aria-pressed={autoCaptureOnShortcut}
                >
                  <span />
                </button>
              </div>
            </section>

            <section className="settings-node-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsNotifications} alt="" />
                <h3>Notifications</h3>
              </div>

              <div className="settings-toggle-row">
                <span>Show capture confirmation</span>
                <button
                  type="button"
                  className={`settings-toggle ${showCaptureConfirmation ? 'on' : ''}`}
                  onClick={() => setShowCaptureConfirmation((prev) => !prev)}
                  aria-pressed={showCaptureConfirmation}
                >
                  <span />
                </button>
              </div>
            </section>

            <section className="settings-node-card settings-storage-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsStorage} alt="" />
                <h3>Storage</h3>
              </div>

              <div className="settings-storage-row">
                <span>Local storage used</span>
                <strong>{localStorageMB.toFixed(1)} MB</strong>
              </div>

              <div className="settings-storage-track">
                <span className="settings-storage-fill" style={{ width: `${storageFill}%` }} />
              </div>
              <small>
                {localStorageMB.toFixed(1)} MB of {STORAGE_LIMIT_MB} MB used
              </small>
            </section>

            <section className="settings-node-card">
              <div className="settings-card-title-row">
                <img src={ICONS.settingsAbout} alt="" />
                <h3>About</h3>
              </div>

              <div className="settings-about-grid">
                <div className="settings-about-row">
                  <span>Version</span>
                  <strong>{APP_VERSION}</strong>
                </div>
                <div className="settings-about-row">
                  <span>Platform</span>
                  <strong>{platformLabel}</strong>
                </div>
                <div className="settings-about-row">
                  <span>License</span>
                  <button
                    type="button"
                    className="settings-link-inline"
                    onClick={() => setStatus('License details are not available in-app yet.')}
                  >
                    <span>View</span>
                    <img src={ICONS.settingsExternalLink} alt="" />
                  </button>
                </div>
              </div>
            </section>

            <button type="button" className="settings-logout-link" onClick={onLogout}>
              Log Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderWorkspacePanel() {
    if (displayTab === TAB_KEYS.RECALL) {
      return renderRecallTab()
    }
    if (displayTab === TAB_KEYS.SETTINGS) {
      return renderSettingsTab()
    }
    if (displayTab === TAB_KEYS.DASHBOARD) {
      return renderDashboardTab()
    }
    return renderCapturesTab('Captures')
  }

  function renderWorkspaceShell() {
    const navItems = [
      { key: TAB_KEYS.DASHBOARD, label: 'Dashboard', icon: ICONS.navDashboard },
      { key: TAB_KEYS.CAPTURES, label: 'Captures', icon: ICONS.navCaptures },
      { key: TAB_KEYS.RECALL, label: 'Recall', icon: ICONS.navRecall },
      { key: TAB_KEYS.SETTINGS, label: 'Settings', icon: ICONS.navSettings }
    ]
    const hideStatusByDefault = displayTab === TAB_KEYS.RECALL || displayTab === TAB_KEYS.DASHBOARD
    const isCaptureConfirmationStatus = status === CAPTURE_SUCCESS_STATUS
    const showStatusBar =
      !hideStatusByDefault ||
      isAsking ||
      statusTone === 'danger' ||
      statusTone === 'info' ||
      (showCaptureConfirmation && isCaptureConfirmationStatus)

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
              <button
                type="button"
                className="quick-capture-action"
                onClick={beginRegionCapture}
                disabled={isSavingCapture || isRegionSelectorOpen}
              >
                {captureNowLabel}
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

            <button
              type="button"
              className={`telegram-footer ${isTelegramLinked ? 'is-linked' : 'is-unlinked'}`}
              onClick={openTelegramSetup}
            >
              <span className="telegram-footer-head">
                <span className="telegram-footer-icon">
                  <img src={ICONS.telegramNotice} alt="" />
                </span>
                <span className="telegram-footer-copy">
                  <strong>{isTelegramLinked ? 'Telegram connected' : 'Connect Telegram'}</strong>
                  <span>{isTelegramLinked ? 'Manage setup' : 'Mobile recall setup'}</span>
                </span>
              </span>
              <small>
                {isTelegramLinked
                  ? `${telegramBotHandle} is ready for mobile recall and summaries.`
                  : 'Ask questions in Telegram to instantly recall any captured fact.'}
              </small>
            </button>
          </aside>

          <section className="workspace-main">
            {showStatusBar ? (
              <div className={`top-status tone-${statusTone}`}>
                <span className="status-copy" key={status}>
                  {status}
                </span>
              </div>
            ) : null}

            <div className={`workspace-panel tab-${tabStage}`}>{renderWorkspacePanel()}</div>

            <footer className="workspace-footbar">
              <div>
                <span className="sync-dot" /> Synced
                <span className="sep">|</span>
                <span>
                  {captureCount} captures · {factsCount} facts
                </span>
              </div>
              <div>
                <span>Local: {localStorageMB.toFixed(1)} MB</span>
                <span className="sep">|</span>
                <span>v{APP_VERSION}</span>
              </div>
            </footer>
          </section>
        </div>
        {renderRegionCaptureSelector()}
        {React.createElement(TelegramSetupDialog, {
          open: isTelegramSetupOpen,
          onClose: closeTelegramSetup,
          onComplete: onCompleteTelegramSetup,
          onPrepareLink: onStartTelegramLink,
          onCheckStatus: onCheckTelegramStatus,
          onCopyCode: onCopyEventID,
          isLinked: isTelegramLinked,
          isPreparing: isStartingTelegramLink,
          isChecking: isCheckingTelegramLink,
          eventId: telegramEventID,
          botUsername,
          linkedAccountLabel: linkedTelegramAccountLabel,
          autoSyncCaptures,
          onToggleAutoSyncCaptures: () => setAutoSyncCaptures((prev) => !prev),
          includeSourceScreenshot: telegramIncludeSourceScreenshot,
          onToggleIncludeSourceScreenshot: () => setTelegramIncludeSourceScreenshot((prev) => !prev),
          qaMode: telegramQAMode,
          onToggleQAMode: () => setTelegramQAMode((prev) => !prev),
          dailyDigest: telegramDailyDigest,
          onToggleDailyDigest: () => setTelegramDailyDigest((prev) => !prev),
          icons: {
            telegram: ICONS.telegramNotice,
            bot: ICONS.telegram,
            externalLink: ICONS.settingsExternalLink,
            arrowRight: ICONS.arrowRight,
            copy: ICONS.copy,
            check: ICONS.check,
            lock: ICONS.lock
          }
        })}
      </div>
    )
  }

  function renderActiveScreen() {
    if (displayScreen === 'loading') {
      return renderLoadingScreen()
    }
    if (displayScreen === 'login') {
      return renderLoginScreen()
    }
    return renderWorkspaceShell()
  }

  return (
    <div className={`screen-transition-layer stage-${screenStage}`}>
      {renderActiveScreen()}
      {renderGlobalLoader()}
      {renderErrorPopup()}
    </div>
  )
}

export default App
