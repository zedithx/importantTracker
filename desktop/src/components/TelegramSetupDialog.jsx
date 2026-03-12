import { useEffect, useRef, useState } from 'react'

function normalizeBotUsername(botUsername) {
  const normalized = String(botUsername || '').trim().replace(/^@+/, '')
  return normalized || 'SnapRecallBot'
}

function TelegramSetupPreference({ title, description, enabled, onToggle, disabled }) {
  return (
    <div className="telegram-setup-preference">
      <div className="telegram-setup-preference-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        className={`telegram-setup-toggle ${enabled ? 'on' : ''}`}
        onClick={onToggle}
        aria-pressed={enabled}
        disabled={disabled}
      >
        <span />
      </button>
    </div>
  )
}

function TelegramSetupProgress({ step, linked, checkIcon }) {
  const steps = [
    { label: 'Open Bot', done: step > 0 || linked },
    { label: 'Link', done: linked },
    { label: 'Configure', done: linked && step >= 2 }
  ]

  return (
    <div className="telegram-setup-progress" role="list" aria-label="Telegram setup progress">
      {steps.map((item, index) => {
        const isActive = !item.done && (step === index || (index === 1 && step === 1))

        return (
          <div key={item.label} className="telegram-setup-progress-node" role="listitem">
            <div className="telegram-setup-progress-stack">
              <div
                className={`telegram-setup-progress-marker ${item.done ? 'done' : ''} ${isActive ? 'active' : ''}`}
              >
                {item.done ? <img src={checkIcon} alt="" /> : <span>{index + 1}</span>}
              </div>
              <span>{item.label}</span>
            </div>
            {index < steps.length - 1 ? <div className={`telegram-setup-progress-line ${item.done ? 'done' : ''}`} /> : null}
          </div>
        )
      })}
    </div>
  )
}

function TelegramSetupDialog({
  open,
  onClose,
  onComplete,
  onPrepareLink,
  onCheckStatus,
  onCopyCode,
  isLinked,
  isPreparing,
  isChecking,
  eventId,
  botUsername,
  linkedAccountLabel,
  autoSyncCaptures,
  onToggleAutoSyncCaptures,
  includeSourceScreenshot,
  onToggleIncludeSourceScreenshot,
  qaMode,
  onToggleQAMode,
  dailyDigest,
  onToggleDailyDigest,
  icons
}) {
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(false)
  const previousOpenRef = useRef(false)
  const normalizedBotUsername = normalizeBotUsername(botUsername)
  const botHandle = `@${normalizedBotUsername}`
  const botLink = `https://t.me/${normalizedBotUsername}`

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      setCopied(false)
      setStep(isLinked ? 2 : 0)
    }

    previousOpenRef.current = open
  }, [isLinked, open])

  useEffect(() => {
    if (!open || !isLinked || step >= 2) {
      return
    }

    const timer = window.setTimeout(() => {
      setStep(2)
    }, step === 1 ? 1200 : 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isLinked, open, step])

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  async function handleCopy() {
    const copiedOk = await onCopyCode()
    if (!copiedOk) {
      return
    }

    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  function handleContinueToCode() {
    if (!eventId && !isPreparing) {
      void onPrepareLink()
    }
    setStep(1)
  }

  const waitingForCode = !eventId && isPreparing
  const missingCode = !eventId && !isPreparing && !isLinked

  return (
    <div className="telegram-setup-overlay" role="dialog" aria-modal="true" aria-label="Connect Telegram">
      <div className="telegram-setup-card">
        <button type="button" className="telegram-setup-close" onClick={onClose}>
          Close
        </button>

        <div className="telegram-setup-shell">
          <div className="telegram-setup-head">
            <div className="telegram-setup-head-icon">
              <img src={icons.telegram} alt="" />
            </div>
            <h2>{isLinked ? 'Telegram connected' : 'Connect Telegram'}</h2>
            <p>
              {isLinked
                ? 'Manage how SnapRecall captures, recalls, and summarizes inside Telegram.'
                : 'Link your Telegram to capture and recall on the go.'}
            </p>
          </div>

          {TelegramSetupProgress({ step, linked: isLinked, checkIcon: icons.check })}

          <div className="telegram-setup-panel">
            {step === 0 ? (
              <div className="telegram-setup-step">
                <h3>Step 1: Open the SnapRecall bot</h3>
                <p>
                  Open Telegram and start a conversation with the SnapRecall bot. It will receive your captures and
                  answer recall questions from anywhere.
                </p>

                <div className="telegram-setup-bot-card">
                  <div className="telegram-setup-bot-meta">
                    <span className="telegram-setup-bot-avatar">
                      <img src={icons.bot} alt="" />
                    </span>
                    <span>
                      <strong>{botHandle}</strong>
                      <small>SnapRecall AI Assistant</small>
                    </span>
                  </div>

                  <a
                    href={botLink}
                    className="telegram-setup-open-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Open in Telegram</span>
                    <img src={icons.externalLink} alt="" />
                  </a>
                </div>

                <button
                  type="button"
                  className="telegram-setup-primary"
                  onClick={handleContinueToCode}
                  disabled={isPreparing && !eventId}
                >
                  <span>{isPreparing && !eventId ? 'Preparing secure code...' : "I've opened the bot"}</span>
                  <img src={icons.arrowRight} alt="" />
                </button>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="telegram-setup-step">
                <h3>Step 2: Send this code to the bot</h3>
                <p>
                  Send the verification code below to {botHandle} in Telegram. SnapRecall will detect the link
                  automatically and move you into setup.
                </p>

                <div className="telegram-setup-code-block">
                  <span>Your verification code</span>
                  <div className="telegram-setup-code-row">
                    <code className={!eventId ? 'pending' : ''}>
                      {eventId || (waitingForCode ? 'Generating...' : 'Tap refresh below')}
                    </code>
                    <button type="button" onClick={handleCopy} disabled={!eventId}>
                      {copied ? (
                        <>
                          <img src={icons.check} alt="" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <img src={icons.copy} alt="" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <small>
                    {eventId
                      ? 'Code expires in 10 minutes'
                      : waitingForCode
                        ? 'Generating a secure verification code now'
                        : 'Generate a fresh verification code to continue'}
                  </small>
                </div>

                {isLinked ? (
                  <div className="telegram-setup-status-card success" aria-live="polite">
                    <div className="telegram-setup-status-icon">
                      <img src={icons.check} alt="" />
                    </div>
                    <div className="telegram-setup-status-copy">
                      <strong>Telegram linked</strong>
                      <span>Connected as {linkedAccountLabel}</span>
                    </div>
                  </div>
                ) : missingCode ? (
                  <div className="telegram-setup-status-card waiting" aria-live="polite">
                    <div className="telegram-setup-spinner" aria-hidden="true" />
                    <div className="telegram-setup-status-copy">
                      <strong>We still need a verification code</strong>
                      <span>Generate one, then send it to {botHandle} to finish linking.</span>
                    </div>
                    <div className="telegram-setup-inline-actions">
                      <button type="button" onClick={() => void onPrepareLink()} disabled={isPreparing}>
                        {isPreparing ? 'Generating...' : 'Generate code'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="telegram-setup-status-card waiting" aria-live="polite">
                    <div className="telegram-setup-spinner" aria-hidden="true" />
                    <div className="telegram-setup-status-copy">
                      <strong>{isChecking ? 'Checking Telegram...' : 'Waiting for link...'}</strong>
                      <span>Send the code above to {botHandle} and SnapRecall will detect it automatically.</span>
                    </div>
                    <div className="telegram-setup-inline-actions">
                      <a href={botLink} target="_blank" rel="noreferrer">
                        Open bot
                      </a>
                      <button type="button" onClick={onCheckStatus} disabled={isChecking}>
                        {isChecking ? 'Checking...' : 'Check now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="telegram-setup-step">
                <h3>Step 3: Configure preferences</h3>
                <p>Choose how SnapRecall behaves inside Telegram. You can update these preferences later in Settings.</p>

                <div className="telegram-setup-preferences">
                  {TelegramSetupPreference({
                    title: 'Auto-send captures',
                    description: 'Automatically send extracted facts to Telegram after each capture.',
                    enabled: autoSyncCaptures,
                    onToggle: onToggleAutoSyncCaptures
                  })}
                  {TelegramSetupPreference({
                    title: 'Include source screenshot',
                    description: 'Attach the original screenshot image alongside extracted facts.',
                    enabled: includeSourceScreenshot,
                    onToggle: onToggleIncludeSourceScreenshot
                  })}
                  {TelegramSetupPreference({
                    title: 'Q&A mode',
                    description: 'Enable natural language questions in Telegram to recall facts.',
                    enabled: qaMode,
                    onToggle: onToggleQAMode
                  })}
                  {TelegramSetupPreference({
                    title: 'Daily digest',
                    description: 'Receive a daily summary of upcoming events from your captures.',
                    enabled: dailyDigest,
                    onToggle: onToggleDailyDigest
                  })}
                </div>

                <button type="button" className="telegram-setup-primary" onClick={onComplete}>
                  <span>Finish setup</span>
                  <img src={icons.check} alt="" />
                </button>
              </div>
            ) : null}
          </div>

          {step < 2 ? (
            <button type="button" className="telegram-setup-skip" onClick={onClose}>
              Skip for now. You can connect later in Settings.
            </button>
          ) : null}

          <div className="telegram-setup-security">
            <img src={icons.lock} alt="" />
            <span>End-to-end encrypted. Your data stays private.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TelegramSetupDialog
