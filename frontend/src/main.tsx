import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
import {DialogProvider} from './components/ui/Dialogs'
import {ContextMenuProvider} from './components/ui/ContextMenu'
import {loadSettings} from './lib/settings'
import {initCaptureProtection} from './lib/captureProtection'
import {initAppLock} from './lib/appLock'

const container = document.getElementById('root')

const root = createRoot(container!)

// Load settings first so terminals open with the saved theme and font.
// The lock state comes before the first render too, so a locked app never
// flashes its hosts or terminals on startup.
Promise.allSettled([loadSettings(), initAppLock()]).finally(() => {
    initCaptureProtection()
    root.render(
    <React.StrictMode>
        <DialogProvider>
            <ContextMenuProvider>
                <App/>
            </ContextMenuProvider>
        </DialogProvider>
    </React.StrictMode>
)})
