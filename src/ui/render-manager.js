// src/ui/render-manager.js
// Batches and throttles screen.render() calls for performance

let renderPending = false;
let renderTimeout = null;
let renderFrameScheduled = false;

const BATCH_DELAY_MS = 16; // ~60fps max render rate

/**
 * Request a render. Batched - multiple rapid calls result in single render.
 */
function requestRender() {
    if (renderPending) return;

    renderPending = true;

    if (!renderTimeout) {
        renderTimeout = setTimeout(() => {
            if (renderPending) {
                performRender();
            }
            renderTimeout = null;
            renderPending = false;
        }, BATCH_DELAY_MS);
    }
}

/**
 * Force immediate render (bypass batching, use sparingly)
 */
function forceRender() {
    renderPending = false;
    if (renderTimeout) {
        clearTimeout(renderTimeout);
        renderTimeout = null;
    }
    performRender();
}

let screenRef = null;

function performRender() {
    if (screenRef) {
        try {
            screenRef.render();
        } catch (e) {
            // Silently ignore render errors
        }
    }
}

/**
 * Initialize with screen reference
 */
function initRenderManager(screen) {
    screenRef = screen;
}

module.exports = {
    requestRender,
    forceRender,
    initRenderManager
};
