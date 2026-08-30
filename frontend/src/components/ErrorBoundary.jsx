import React from 'react';

/** Short, human-friendly reference id so support can match UI reports to logs. */
function generateErrorId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8).toUpperCase();
    }
  } catch (_ignored) {}
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = generateErrorId();
    this.setState({ errorId });
    // Log full details for debugging (and give support a reference id).
    console.error(`ErrorBoundary [${errorId}]:`, error, errorInfo);
  }

  handleReload = () => {
    // Full page reload discards all in-memory app state and starts fresh.
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.fallback}>
          <div role="alert" style={styles.popup}>
            <h2 style={styles.heading}>A Critical Error Occurred</h2>
            <p style={styles.body}>
              The application encountered an unexpected error. Please try reloading the page.
            </p>
            {this.state.errorId && (
              <p style={styles.errorId}>Error ID: {this.state.errorId}</p>
            )}
            <button type="button" onClick={this.handleReload} style={styles.button}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

const styles = {
  fallback: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    color: '#333',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: 16,
  },
  popup: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16)',
    maxWidth: 480,
    width: '100%',
    padding: '32px 32px 28px',
    textAlign: 'center',
  },
  heading: {
    margin: '0 0 12px',
    fontSize: '1.5rem',
    color: '#d63031',
  },
  body: {
    margin: '0 0 8px',
    lineHeight: 1.5,
  },
  errorId: {
    margin: '0 0 20px',
    fontSize: '0.8rem',
    opacity: 0.7,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
