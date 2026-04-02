// src/ui/scroll-manager.js
// Handles throttled scrolling to prevent UI lag

let scrollTimeout = null;
let pendingScroll = false;
let scrollInterval = null;
let isActive = false;

const SCROLL_THROTTLE_MS = 50; // Minimum ms between scroll operations

/**
 * Request a scroll-to-bottom operation. Throttled to prevent lag.
 * Multiple calls within THROTTLE_MS are coalesced into a single scroll.
 */
function requestScroll() {
    pendingScroll = true;
    if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
            if (pendingScroll && isActive) {
                performScroll();
            }
            scrollTimeout = null;
            pendingScroll = false;
        }, SCROLL_THROTTLE_MS);
    }
}

/**
 * Immediately scroll to bottom (bypass throttling, use sparingly)
 */
function scrollNow() {
    pendingScroll = false;
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
    }
    performScroll();
}

function performScroll() {
    // This will be set by the UI module
    if (typeof performScrollCallback === 'function') {
        performScrollCallback();
    }
}

let performScrollCallback = null;

/**
 * Initialize the scroll manager with the actual scroll function
 */
function initScrollManager(callback) {
    performScrollCallback = callback;
    isActive = true;
}

/**
 * Pause scroll processing (e.g., when modal is open)
 */
function pauseScroll() {
    isActive = false;
    pendingScroll = false;
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
    }
}

/**
 * Resume scroll processing
 */
function resumeScroll() {
    isActive = true;
}

module.exports = {
    requestScroll,
    scrollNow,
    initScrollManager,
    pauseScroll,
    resumeScroll
};
