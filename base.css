:root {
  --bg-main: #121214;
  --bg-surface: #1e1e24;
  --text-primary: #ffffff;
  --text-muted: #a0a0b0;
  --colour-correct: #2e7d32;
  --colour-wrong: #3a3a3c;
  --colour-directional: #b59f3b;
  --border-subtle: #33333b;
  --accent: #3b82f6;
  --danger: #d32f2f;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg-main);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  min-height: 100vh;
}

/* Header Component */
header h1 {
  letter-spacing: 3px;
  margin-top: 4px;
  margin-bottom: 2px;
  text-align: center;
  font-size: 1.6rem;
}

header p {
  color: var(--text-muted);
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 0.85rem;
  text-align: center;
}

/* Base Main Layout Container */
.game-container {
  width: 100%;
  max-width: 600px;
  background-color: var(--bg-surface);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Status Bar */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-main);
  padding: 0.6rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  font-size: 0.9rem;
  font-weight: 600;
}

.status-bar span {
  color: var(--accent);
}

.section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
}

/* Shared Primary Action Button */
.submit-btn {
  width: 100%;
  padding: 0.75rem;
  border-radius: 4px;
  border: none;
  background-color: var(--text-primary);
  color: #000000;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.submit-btn:disabled {
  background-color: var(--border-subtle);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Shared Lightbox Modal */
.modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  justify-content: center;
  align-items: center;
  padding: 1rem;
}

.modal.active {
  display: flex;
}

.modal img {
  max-width: 90%;
  max-height: 80vh;
  border-radius: 6px;
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: var(--text-primary);
  color: #000000;
  border: none;
  padding: 6px 10px;
  border-radius: 50%;
  font-weight: bold;
  cursor: pointer;
}