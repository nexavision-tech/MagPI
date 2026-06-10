import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Initialize the Daemon Port globally before the React tree mounts
window.MAGPI_PORT = localStorage.getItem('magpi_daemon_port') || '8282';

// The Gaian Mind UI Entry Point
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)