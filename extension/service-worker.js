'use strict';

const APP_ORIGIN = 'https://work-summary-tool.vercel.app';
const APP_MATCH = `${APP_ORIGIN}/*`;
const COMIRU_ORIGIN = 'https://comiru.jp';
const COMIRU_MATCH = `${COMIRU_ORIGIN}/*`;
const DEFAULT_TENANT = 'bestone-aizumi';
const STORAGE_PREFIX = 'comiru-csv:';
const STORAGE_TTL_MS = 30 * 60 * 1000;
// base64 adds roughly 33%, while storage.session has a 10 MB quota.
const MAX_CSV_BYTES = 6 * 1024 * 1024;

let activeJob = null;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const toErrorPayload = (error, fallbackCode = 'COMIRU_EXPORT_FAILED') => ({
  code: typeof error?.code === 'string' ? error.code : fallbackCode,
  message: error instanceof Error ? error.message : String(error || '不明なエラーが発生しました。'),
  detail: typeof error?.detail === 'string' ? error.detail : undefined,
  recoverable: error?.recoverable !== false,
});

const makeError = (code, message, detail, recoverable = true) => {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  error.recoverable = recoverable;
  return error;
};

const isAppSender = (sender) => {
  try {
    const url = new URL(sender?.url || sender?.tab?.url || '');
    return url.origin === APP_ORIGIN
      && Number.isInteger(sender?.tab?.id)
      && sender?.tab?.active === true;
  } catch {
    return false;
  }
};

const isIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const validateRequest = (message) => {
  if (!isIsoDate(message.startDate) || !isIsoDate(message.endDate)) {
    throw makeError('INVALID_DATE', '開始日と終了日を正しく指定してください。');
  }

  const start = new Date(`${message.startDate}T00:00:00Z`);
  const end = new Date(`${message.endDate}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const sameCalendarMonth = start.getUTCFullYear() === end.getUTCFullYear()
    && start.getUTCMonth() === end.getUTCMonth();
  if (days < 1 || days > 31 || !sameCalendarMonth) {
    throw makeError('INVALID_DATE_RANGE', '取得期間は同じ月の中で、31日以内にしてください。');
  }

  if (typeof message.requestId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(message.requestId)) {
    throw makeError('INVALID_REQUEST_ID', '処理識別子が正しくありません。');
  }
};

const notifyApp = async (job, message) => {
  let tabId = job.appTabId;
  try {
    await chrome.tabs.get(tabId);
  } catch {
    const appTabs = await chrome.tabs.query({ url: APP_MATCH });
    if (!appTabs.length) {
      return false;
    }
    tabId = appTabs[0].id;
    job.appTabId = tabId;
  }

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
};

const notifyProgress = (job, phase, message, details) => notifyApp(job, {
  type: 'COMIRU_IMPORT_STATUS',
  requestId: job.requestId,
  stage: phase,
  message,
  details,
});

const waitForTabComplete = async (tabId, timeoutMs = 60000) => {
  const current = await chrome.tabs.get(tabId);
  if (current.status === 'complete') {
    return current;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(makeError('PAGE_LOAD_TIMEOUT', 'Comiruの画面読み込みが完了しませんでした。'));
    }, timeoutMs);

    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve(tab);
      }
    };
    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        cleanup();
        reject(makeError('TAB_CLOSED', '処理中にComiruのタブが閉じられました。'));
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
};

const getTenantFromUrl = (urlText) => {
  try {
    const url = new URL(urlText);
    if (url.origin !== COMIRU_ORIGIN) {
      return null;
    }
    // Global Comiru pages can begin with paths such as /teachers or /login.
    // Only a URL that already contains /<tenant>/reports is authoritative.
    const reportsPath = /^\/([^/]+)\/reports(?:\/|$)/.exec(url.pathname);
    return reportsPath?.[1] || null;
  } catch {
    // Fall through to the known school tenant.
  }
  return null;
};

const openComiruSearch = async (job) => {
  const tabs = await chrome.tabs.query({ url: COMIRU_MATCH });
  const searchTab = tabs.find((tab) => tab.url?.includes('/reports/search'));
  const reusableTab = searchTab || tabs.find((tab) => tab.id !== job.appTabId);
  const tenant = getTenantFromUrl(reusableTab?.url) || DEFAULT_TENANT;
  const searchUrl = new URL(`/${tenant}/reports/search`, COMIRU_ORIGIN);
  searchUrl.searchParams.set('date_start', job.startDate);
  searchUrl.searchParams.set('date_end', job.endDate);

  let tab;
  if (reusableTab?.id) {
    tab = await chrome.tabs.update(reusableTab.id, { url: searchUrl.href, active: true });
  } else {
    tab = await chrome.tabs.create({ url: searchUrl.href, active: true });
  }

  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  job.comiruTabId = tab.id;
  await waitForTabComplete(tab.id);

  const loadedTab = await chrome.tabs.get(tab.id);
  let loadedUrl;
  try {
    loadedUrl = new URL(loadedTab.url || '');
  } catch {
    loadedUrl = null;
  }
  if (loadedUrl?.origin !== COMIRU_ORIGIN || !loadedUrl.pathname.includes('/reports/search')) {
    throw makeError(
      'COMIRU_LOGIN_REQUIRED',
      'Comiruへのログインが必要です。開いたタブでログインしてから、もう一度実行してください。',
      loadedTab.url,
    );
  }

  return tab.id;
};

// This function is serialized by chrome.scripting.executeScript and therefore
// intentionally contains all of its helpers.
async function automateComiruPage(requestId, maxCsvBytes) {
  const MAIN_SOURCE = 'work-summary-tool-comiru-main';
  const deadlineAt = Date.now() + 150000;
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const progress = (phase, message, details) => {
    window.postMessage({
      source: MAIN_SOURCE,
      type: 'COMIRU_AUTOMATION_PROGRESS',
      requestId,
      phase,
      message,
      details,
    }, window.location.origin);
  };
  const fail = (code, message, detail) => {
    const error = new Error(message);
    error.code = code;
    error.detail = detail;
    throw error;
  };
  const ensureWithinDeadline = () => {
    if (Date.now() >= deadlineAt) {
      fail(
        'AUTOMATION_TIMEOUT',
        '全件読込の制限時間を超えました。期間を短くするか、通信状態を確認して再実行してください。',
      );
    }
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0;
  };
  const waitUntil = async (predicate, timeoutMs, errorCode, errorMessage) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs && Date.now() < deadlineAt) {
      const value = predicate();
      if (value) {
        return value;
      }
      await sleep(250);
    }
    ensureWithinDeadline();
    fail(errorCode, errorMessage);
  };
  const getReportCheckboxes = (form) => {
    const explicit = Array.from(form.querySelectorAll('input[name="reports_ids[]"]'))
      .filter((input) => !input.disabled);
    if (explicit.length) {
      return explicit;
    }
    const all = Array.from(form.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => !input.disabled && input.name);
    const rowBased = all.filter((input) => {
      const row = input.closest('tr, li, [class*="report"], [data-report-id]');
      return Boolean(row?.querySelector('a[href*="/reports/"]'));
    });
    if (rowBased.length) {
      return rowBased;
    }

    const likely = all.filter((input) => {
      const token = `${input.name} ${input.id}`.toLowerCase();
      return /(report|selected|checked|ids?\b)/.test(token)
        && !/(comment|understanding|lesson_type|published|status)/.test(token);
    });
    return likely.length ? likely : all;
  };
  const setChecked = (input) => {
    if (input.checked) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    descriptor?.set?.call(input, true);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const bytesToBase64 = (bytes) => {
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  };
  const getFilename = (contentDisposition) => {
    const utf8Name = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition || '')?.[1];
    if (utf8Name) {
      try {
        return decodeURIComponent(utf8Name.replace(/^['"]|['"]$/g, ''));
      } catch {
        // Continue to the simple filename form.
      }
    }
    const simpleName = /filename\s*=\s*["']?([^;"']+)/i.exec(contentDisposition || '')?.[1];
    return simpleName || '指導報告書.csv';
  };

  try {
    if (!window.location.pathname.includes('/reports/search')) {
      fail('COMIRU_SEARCH_NOT_FOUND', 'Comiruの指導報告書検索画面を開けませんでした。');
    }

    progress('waiting_for_results', '指導報告書の検索結果を確認しています。');
    await waitUntil(
      () => document.querySelector('.read-more, button[name="csv"], input[name="csv"]'),
      30000,
      'RESULTS_NOT_FOUND',
      '検索結果が見つかりません。Comiruのログイン状態と指定期間を確認してください。',
    );

    let clickCount = 0;
    let stalledCount = 0;
    while (true) {
      ensureWithinDeadline();
      const readMore = Array.from(document.querySelectorAll('.read-more')).find(isVisible);
      if (!readMore) {
        break;
      }
      if (clickCount >= 200) {
        fail('TOO_MANY_PAGES', '「さらに表示」の回数が上限に達しました。期間を短くして再実行してください。');
      }

      const clickable = readMore.matches('button, a, input')
        ? readMore
        : readMore.querySelector('button, a, input') || readMore;
      const beforeCount = document.querySelectorAll('input[type="checkbox"]').length;
      const beforeHeight = document.documentElement.scrollHeight;
      clickCount += 1;
      progress('loading_reports', '指導報告書を全件読み込んでいます。', {
        loadMoreClicks: clickCount,
        visibleCheckboxes: beforeCount,
      });
      clickable.scrollIntoView({ block: 'center', behavior: 'auto' });
      clickable.click();

      const started = Date.now();
      let advanced = false;
      while (Date.now() - started < 20000 && Date.now() < deadlineAt) {
        await sleep(300);
        const nextReadMore = Array.from(document.querySelectorAll('.read-more')).find(isVisible);
        const nextCount = document.querySelectorAll('input[type="checkbox"]').length;
        const nextHeight = document.documentElement.scrollHeight;
        if (!nextReadMore || nextCount > beforeCount || nextHeight > beforeHeight) {
          advanced = true;
          break;
        }
      }
      ensureWithinDeadline();

      if (!advanced) {
        stalledCount += 1;
        if (stalledCount >= 3) {
          fail(
            'LOAD_MORE_STALLED',
            '「さらに表示」を押しましたが、指導報告書が追加されませんでした。通信状態を確認してください。',
          );
        }
      } else {
        stalledCount = 0;
      }
      await sleep(350);
    }

    const csvControl = await waitUntil(
      () => document.querySelector('button[name="csv"], input[name="csv"]'),
      30000,
      'CSV_BUTTON_NOT_FOUND',
      'CSVダウンロードボタンが見つかりませんでした。',
    );
    const form = csvControl.form || csvControl.closest('form');
    if (!form) {
      fail('CSV_FORM_NOT_FOUND', 'CSVダウンロード用のフォームが見つかりませんでした。');
    }

    const explicitSelectAll = document.querySelector('#x-select-all-reports');
    const selectAllLabel = Array.from(form.querySelectorAll('label')).find((label) =>
      label.textContent?.replace(/\s/g, '').includes('すべて選択'));
    const selectAll = explicitSelectAll
      || selectAllLabel?.control
      || selectAllLabel?.querySelector('input[type="checkbox"]');
    if (selectAll && !selectAll.checked) {
      selectAll.click();
      await sleep(300);
    }

    const reportCheckboxes = getReportCheckboxes(form);
    if (!reportCheckboxes.length) {
      fail(
        'REPORT_CHECKBOXES_NOT_FOUND',
        '選択できる指導報告書がありません。指定期間にデータがあるか確認してください。',
      );
    }

    progress('selecting_reports', `${reportCheckboxes.length}件の指導報告書を選択しています。`, {
      reportCount: reportCheckboxes.length,
      loadMoreClicks: clickCount,
    });
    reportCheckboxes.forEach(setChecked);
    const selectedCount = reportCheckboxes.filter((input) => input.checked).length;
    if (selectedCount !== reportCheckboxes.length) {
      fail('REPORT_SELECTION_FAILED', '一部の指導報告書を選択できませんでした。');
    }

    const formData = new FormData(form);
    if (csvControl.name) {
      formData.append(csvControl.name, csvControl.value);
    }
    const encodedForm = new URLSearchParams();
    for (const [name, value] of formData.entries()) {
      if (typeof value === 'string') {
        encodedForm.append(name, value);
      }
    }
    const action = csvControl.hasAttribute('formaction')
      ? csvControl.formAction
      : form.action || window.location.href;
    const actionUrl = new URL(action, window.location.href);
    if (actionUrl.origin !== window.location.origin) {
      fail('INVALID_CSV_ENDPOINT', 'CSVの送信先を安全に確認できませんでした。');
    }
    progress('downloading_csv', '選択した指導報告書のCSVを取得しています。', {
      reportCount: selectedCount,
    });

    ensureWithinDeadline();
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(30000, deadlineAt - Date.now())),
    );
    let response;
    let bytes;
    try {
      response = await fetch(actionUrl.href, {
        method: 'POST',
        body: encodedForm,
        credentials: 'same-origin',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/csv, application/csv, application/octet-stream, */*',
        },
      });
      if (!response.ok) {
        fail('CSV_HTTP_ERROR', `CSV取得に失敗しました（HTTP ${response.status}）。`);
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        fail('CSV_REQUEST_TIMEOUT', 'CSV取得が時間内に完了しませんでした。通信状態を確認してください。');
      }
      throw error;
    } finally {
      window.clearTimeout(requestTimeout);
    }

    ensureWithinDeadline();
    const contentType = response.headers.get('content-type') || '';
    if (!bytes.length) {
      fail('EMPTY_CSV', '取得したCSVが空でした。');
    }
    if (bytes.byteLength > maxCsvBytes) {
      fail('CSV_TOO_LARGE', 'CSVの容量が大きすぎます。期間を短くして再実行してください。');
    }

    const asciiPrefix = new TextDecoder('windows-1252').decode(bytes.slice(0, 1024));
    const trimmed = asciiPrefix.trimStart().toLowerCase();
    if (contentType.includes('text/html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      fail(
        'COMIRU_SESSION_EXPIRED',
        'Comiruのログイン期限が切れた可能性があります。再ログインしてから実行してください。',
      );
    }
    if (!bytes.slice(0, 4096).includes(44)) {
      fail('INVALID_CSV_RESPONSE', 'ComiruからCSVではないデータが返されました。');
    }
    const headerBytes = bytes.slice(0, Math.min(bytes.length, 16384));
    let headerText;
    try {
      headerText = new TextDecoder('utf-8', { fatal: true }).decode(headerBytes);
    } catch {
      headerText = new TextDecoder('shift_jis').decode(headerBytes);
    }
    const headerLine = headerText.replace(/^\uFEFF/u, '').split(/\r?\n/u, 1)[0] || '';
    const requiredHeaders = ['生徒氏名', '書いた先生', '授業開始時間'];
    if (!requiredHeaders.every((header) => headerLine.includes(header))) {
      fail('INVALID_CSV_RESPONSE', 'Comiruの指導報告書CSVとして確認できないデータが返されました。');
    }

    return {
      ok: true,
      base64: bytesToBase64(bytes),
      fileName: getFilename(response.headers.get('content-disposition')),
      mimeType: contentType.split(';')[0] || 'text/csv',
      reportCount: selectedCount,
      byteLength: bytes.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: typeof error?.code === 'string' ? error.code : 'COMIRU_PAGE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        detail: typeof error?.detail === 'string' ? error.detail : undefined,
      },
    };
  }
}

const runPageAutomation = async (job) => {
  const injection = await chrome.scripting.executeScript({
    target: { tabId: job.comiruTabId },
    world: 'MAIN',
    func: automateComiruPage,
    args: [job.requestId, MAX_CSV_BYTES],
  });
  const result = injection?.[0]?.result;
  if (!result?.ok) {
    const pageError = result?.error || {};
    throw makeError(
      pageError.code || 'COMIRU_PAGE_ERROR',
      pageError.message || 'Comiru画面の自動操作に失敗しました。',
      pageError.detail,
    );
  }
  return result;
};

const focusAppTab = async (job) => {
  let appTab;
  try {
    appTab = await chrome.tabs.get(job.appTabId);
    let appUrl;
    try {
      appUrl = new URL(appTab.url || '');
    } catch {
      appUrl = null;
    }
    if (appUrl?.origin !== APP_ORIGIN) {
      appTab = null;
    }
  } catch {
    appTab = null;
  }

  if (!appTab) {
    const existing = await chrome.tabs.query({ url: APP_MATCH });
    appTab = existing[0] || await chrome.tabs.create({ url: APP_ORIGIN, active: true });
    job.appTabId = appTab.id;
  }

  await chrome.tabs.update(appTab.id, { active: true });
  if (appTab.windowId) {
    await chrome.windows.update(appTab.windowId, { focused: true }).catch(() => undefined);
  }
  await waitForTabComplete(appTab.id, 30000);
  await wait(500);
  return appTab.id;
};

const deliverStoredCsv = async (job, storageKey) => {
  const stored = (await chrome.storage.session.get(storageKey))[storageKey];
  if (!stored?.base64) {
    throw makeError('STORED_CSV_MISSING', '取得済みCSVの一時データが見つかりませんでした。');
  }

  const appTabId = await focusAppTab(job);
  await notifyProgress(job, 'returning_to_app', 'CSVを勤務時間集計アプリへ渡しています。', {
    reportCount: stored.reportCount,
  });

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const acknowledgement = await chrome.tabs.sendMessage(appTabId, {
        type: 'COMIRU_CSV_DELIVER',
        requestId: stored.requestId,
        payload: {
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          base64: stored.base64,
          rowCount: stored.reportCount,
          startDate: stored.startDate,
          endDate: stored.endDate,
        },
      });
      if (acknowledgement?.ok) {
        await chrome.storage.session.remove(storageKey);
        return;
      }
      lastError = acknowledgement?.error?.message || 'アプリがCSVを受領できませんでした。';
    } catch (error) {
      lastError = error;
    }
    await wait(500 * attempt);
  }

  throw makeError(
    'APP_DELIVERY_FAILED',
    'CSVをアプリへ渡せませんでした。アプリのタブを再読み込みして、もう一度実行してください。',
    lastError instanceof Error ? lastError.message : String(lastError || ''),
  );
};

const cleanupStaleStorage = async () => {
  const now = Date.now();
  const all = await chrome.storage.session.get(null);
  const staleKeys = Object.entries(all)
    .filter(([key, value]) => key.startsWith(STORAGE_PREFIX) && now - Number(value?.createdAt || 0) > STORAGE_TTL_MS)
    .map(([key]) => key);
  if (staleKeys.length) {
    await chrome.storage.session.remove(staleKeys);
  }
};

const executeJob = async (job) => {
  const storageKey = `${STORAGE_PREFIX}${job.requestId}`;
  try {
    await cleanupStaleStorage();
    await notifyProgress(job, 'opening_comiru', 'Comiruの指導報告書検索を開いています。');
    await openComiruSearch(job);
    await notifyProgress(job, 'page_ready', 'Comiruの検索画面を読み込みました。');

    const result = await runPageAutomation(job);
    // storage.session has a 10 MB quota. Keep only the newest CSV so a large
    // interrupted import cannot make the next successful import exceed it.
    const existingStorage = await chrome.storage.session.get(null);
    const previousCsvKeys = Object.keys(existingStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX));
    if (previousCsvKeys.length) {
      await chrome.storage.session.remove(previousCsvKeys);
    }
    await chrome.storage.session.set({
      [storageKey]: {
        requestId: job.requestId,
        base64: result.base64,
        fileName: result.fileName,
        mimeType: result.mimeType,
        reportCount: result.reportCount,
        byteLength: result.byteLength,
        startDate: job.startDate,
        endDate: job.endDate,
        appTabId: job.appTabId,
        createdAt: Date.now(),
      },
    });

    await notifyProgress(job, 'csv_ready', `${result.reportCount}件のCSVを取得しました。`, {
      reportCount: result.reportCount,
      byteLength: result.byteLength,
    });
    await deliverStoredCsv(job, storageKey);
    await notifyProgress(job, 'complete', 'CSVの受け渡しが完了しました。', {
      reportCount: result.reportCount,
    });
    return { ok: true, requestId: job.requestId };
  } catch (error) {
    await chrome.storage.session.remove(storageKey).catch(() => undefined);
    const errorPayload = toErrorPayload(error);
    const reported = await notifyApp(job, {
      type: 'COMIRU_IMPORT_ERROR',
      requestId: job.requestId,
      code: errorPayload.code,
      message: errorPayload.message,
      detail: errorPayload.detail,
      recoverable: errorPayload.recoverable,
    });
    return { ok: false, error: errorPayload, reported };
  } finally {
    if (activeJob?.requestId === job.requestId) {
      activeJob = null;
    }
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'COMIRU_IMPORT_REQUEST') {
    try {
      if (!isAppSender(sender)) {
        throw makeError('UNTRUSTED_SENDER', '許可されていない画面からの要求です。', undefined, false);
      }
      validateRequest(message);
      if (activeJob) {
        throw makeError('EXPORT_BUSY', '別のCSV取得処理が進行中です。完了してから再実行してください。');
      }

      const job = {
        requestId: message.requestId,
        startDate: message.startDate,
        endDate: message.endDate,
        appTabId: sender.tab.id,
        comiruTabId: null,
      };
      activeJob = job;
      executeJob(job).then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: toErrorPayload(error), reported: false });
      });
    } catch (error) {
      sendResponse({ ok: false, error: toErrorPayload(error, 'INVALID_REQUEST') });
    }
    // Keeping this response channel open also keeps the event alive while the
    // MAIN-world script loads every result and performs the CSV request.
    return true;
  }

  if (message.type === 'COMIRU_AUTOMATION_PROGRESS') {
    if (
      activeJob
      && sender.tab?.id === activeJob.comiruTabId
      && message.requestId === activeJob.requestId
    ) {
      notifyProgress(activeJob, message.phase, message.message, message.details);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  cleanupStaleStorage();
});

chrome.runtime.onStartup.addListener(() => {
  cleanupStaleStorage();
});
