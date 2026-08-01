(() => {
  'use strict';

  const PAGE_SOURCE = 'work-summary-tool';
  const EXTENSION_SOURCE = 'work-summary-comiru-extension';
  const PROTOCOL_VERSION = 1;
  const START_TYPE = 'COMIRU_IMPORT_REQUEST';
  const PING_TYPE = 'COMIRU_EXTENSION_PING';
  const ACK_TYPE = 'COMIRU_CSV_ACK';
  const DELIVERY_ACK_TIMEOUT_MS = 10000;
  const pendingDeliveries = new Map();

  const postToPage = (type, payload = {}) => {
    window.postMessage(
      {
        source: EXTENSION_SOURCE,
        version: PROTOCOL_VERSION,
        type,
        ...payload,
      },
      window.location.origin,
    );
  };

  const makeRequestId = () => {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `comiru-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (
      !message
      || message.source !== PAGE_SOURCE
      || message.version !== PROTOCOL_VERSION
      || typeof message.type !== 'string'
    ) {
      return;
    }

    if (message.type === PING_TYPE) {
      postToPage('COMIRU_EXTENSION_READY', {
        extensionVersion: chrome.runtime.getManifest().version,
      });
      return;
    }

    if (message.type === ACK_TYPE) {
      const pending = typeof message.requestId === 'string'
        ? pendingDeliveries.get(message.requestId)
        : null;
      if (!pending) {
        return;
      }
      window.clearTimeout(pending.timer);
      pendingDeliveries.delete(message.requestId);
      pending.sendResponse({
        ok: message.ok === true,
        error: message.ok === true ? undefined : {
          code: 'PAGE_REJECTED_CSV',
          message: typeof message.message === 'string'
            ? message.message
            : 'アプリがCSVの受領に失敗しました。',
        },
      });
      return;
    }

    if (message.type !== START_TYPE) {
      return;
    }

    const requestId = typeof message.requestId === 'string' && message.requestId
      ? message.requestId
      : makeRequestId();
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : message;

    // The runtime response intentionally remains pending until the worker has
    // finished. This keeps the MV3 message event alive during long imports.
    postToPage('COMIRU_IMPORT_STATUS', {
      requestId,
      stage: 'accepted',
      message: 'ComiruからのCSV取得を開始しました。',
    });

    chrome.runtime.sendMessage({
      type: START_TYPE,
      requestId,
      startDate: payload.startDate,
      endDate: payload.endDate,
    }).then((response) => {
      if (!response?.ok && !response?.reported) {
        postToPage('COMIRU_IMPORT_ERROR', {
          requestId,
          code: response?.error?.code ?? 'EXTENSION_REQUEST_FAILED',
          message: response?.error?.message ?? 'Chrome拡張へ処理を依頼できませんでした。',
          detail: response?.error?.detail,
        });
      }
    }).catch((error) => {
      postToPage('COMIRU_IMPORT_ERROR', {
        requestId,
        code: 'EXTENSION_UNAVAILABLE',
        message: 'Chrome拡張と通信できません。拡張機能が有効か確認してください。',
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    if (message.type === 'COMIRU_IMPORT_STATUS') {
      postToPage('COMIRU_IMPORT_STATUS', {
        requestId: message.requestId,
        stage: message.stage,
        message: message.message,
        details: message.details,
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'COMIRU_IMPORT_ERROR') {
      postToPage('COMIRU_IMPORT_ERROR', {
        requestId: message.requestId,
        code: message.code,
        message: message.message,
        detail: message.detail,
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'COMIRU_CSV_DELIVER') {
      const requestId = message.requestId;
      if (typeof requestId !== 'string' || !requestId) {
        sendResponse({ ok: false, error: { code: 'INVALID_DELIVERY', message: 'CSVの処理識別子がありません。' } });
        return false;
      }

      const previous = pendingDeliveries.get(requestId);
      if (previous) {
        window.clearTimeout(previous.timer);
        previous.sendResponse({
          ok: false,
          error: { code: 'DELIVERY_REPLACED', message: 'CSVの再送を受信しました。' },
        });
      }

      postToPage('COMIRU_CSV_READY', {
        requestId,
        ...message.payload,
      });
      const timer = window.setTimeout(() => {
        const pending = pendingDeliveries.get(requestId);
        if (!pending || pending.sendResponse !== sendResponse) {
          return;
        }
        pendingDeliveries.delete(requestId);
        sendResponse({
          ok: false,
          error: {
            code: 'CSV_ACK_TIMEOUT',
            message: 'アプリからCSVの受領確認がありませんでした。',
          },
        });
      }, DELIVERY_ACK_TIMEOUT_MS);
      pendingDeliveries.set(requestId, { sendResponse, timer });
      return true;
    }

    return false;
  });

  window.addEventListener('pagehide', () => {
    for (const [requestId, pending] of pendingDeliveries) {
      window.clearTimeout(pending.timer);
      pending.sendResponse({
        ok: false,
        error: { code: 'APP_TAB_UNLOADED', message: 'CSV受領前にアプリ画面が閉じられました。' },
      });
      pendingDeliveries.delete(requestId);
    }
  });

})();
