import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Initialize the Daemon Port globally before the React tree mounts
// If we are developing on Vite (5173), fallback to 8282. Otherwise, trust the browser origin port!
window.MAGPI_PORT = window.location.port === '5173' ? '8282' : (window.location.port || '80');

// The Gaian Mind UI Entry Point
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)