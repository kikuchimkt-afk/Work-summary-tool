(() => {
  'use strict';

  const MAIN_SOURCE = 'work-summary-tool-comiru-main';

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (
      !message
      || message.source !== MAIN_SOURCE
      || message.type !== 'COMIRU_AUTOMATION_PROGRESS'
      || typeof message.requestId !== 'string'
    ) {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'COMIRU_AUTOMATION_PROGRESS',
      requestId: message.requestId,
      phase: message.phase,
      message: message.message,
      details: message.details,
    }).catch(() => {
      // Progress is best-effort. The final result is returned by executeScript.
    });
  });
})();
