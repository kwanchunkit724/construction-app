import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#1e1e1e', color: '#f44', minHeight: '100vh' }}>
          <h2 style={{ color: '#f88' }}>⚠ App crashed — check this error:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffa', marginTop: 16 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

// Force SW update + page reload whenever phone opens the app
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(reg => {
    // Reload page the moment a new SW takes control (skipWaiting already active)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
    // Actively check for new SW every time the tab becomes visible (phone wake-up, tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
