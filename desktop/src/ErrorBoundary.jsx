import React from 'react'
import { appLogger, summarizeError } from './logger'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null
    }
  }

  static getDerivedStateFromError(error) {
    return {
      error
    }
  }

  componentDidCatch(error, info) {
    appLogger.error('renderer_error_boundary_triggered', {
      error: summarizeError(error),
      component_stack: info?.componentStack || ''
    })
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="error-boundary-shell">
        <section className="error-boundary-card" role="alert">
          <span className="error-boundary-label">Unexpected app error</span>
          <h1>SnapRecall needs to recover</h1>
          <p>
            The app hit an unexpected error and stopped rendering this screen. Reload the window to
            recover.
          </p>
          <div className="error-boundary-actions">
            <button
              type="button"
              className="error-boundary-button"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </section>
      </div>
    )
  }
}

export default ErrorBoundary
