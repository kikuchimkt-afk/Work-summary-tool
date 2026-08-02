import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, CloudDownload, Loader2, Puzzle, RefreshCw, TriangleAlert } from 'lucide-react';

const APP_SOURCE = 'work-summary-tool';
const EXTENSION_SOURCE = 'work-summary-comiru-extension';
const PROTOCOL_VERSION = 2;
const EXTENSION_VERSION = '1.1.0';
const MAX_BASE64_LENGTH = 30_000_000;

type ConnectionState = 'checking' | 'ready' | 'missing' | 'outdated';
type ImportState = 'idle' | 'working' | 'success' | 'error';

interface ExtensionEnvelope {
    source?: unknown;
    version?: unknown;
    type?: unknown;
    requestId?: unknown;
    campusId?: unknown;
    tenant?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    stage?: unknown;
    message?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    base64?: unknown;
    rowCount?: unknown;
    payload?: unknown;
}

interface ComiruAutoImportProps {
    isProcessing: boolean;
    campusId: string;
    campusName: string;
    comiruTenant: string;
    onImportingChange: (isImporting: boolean) => void;
    onFileSelect: (file: File, encoding: string) => void | Promise<void>;
}

const getDefaultMonth = () => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthRange = (monthValue: string) => {
    const match = /^(\d{4})-(\d{2})$/u.exec(monthValue);
    if (!match) throw new Error('対象月を選択してください。');

    const year = Number(match[1]);
    const month = Number(match[2]);
    const lastDay = new Date(year, month, 0).getDate();
    return {
        startDate: `${match[1]}-${match[2]}-01`,
        endDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
        compact: `${match[1]}${match[2]}`
    };
};

const getPayload = (message: ExtensionEnvelope) => {
    if (!message.payload || typeof message.payload !== 'object') return message;
    return { ...message, ...(message.payload as Record<string, unknown>) };
};

const decodeBase64File = (base64: string, fileName: string, mimeType: string) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], fileName, { type: mimeType });
};

export const ComiruAutoImport = ({
    isProcessing,
    campusId,
    campusName,
    comiruTenant,
    onImportingChange,
    onFileSelect
}: ComiruAutoImportProps) => {
    const [month, setMonth] = useState(getDefaultMonth);
    const [connection, setConnection] = useState<ConnectionState>('checking');
    const [importState, setImportState] = useState<ImportState>('idle');
    const [statusMessage, setStatusMessage] = useState('Chrome拡張との接続を確認しています…');
    const activeRequestId = useRef<string | null>(null);
    const handledRequestIds = useRef(new Set<string>());
    const missingTimer = useRef<number | null>(null);
    const onFileSelectRef = useRef(onFileSelect);

    useEffect(() => {
        onFileSelectRef.current = onFileSelect;
    }, [onFileSelect]);

    useEffect(() => {
        onImportingChange(importState === 'working');
        return () => onImportingChange(false);
    }, [importState, onImportingChange]);

    const monthLabel = useMemo(() => {
        const match = /^(\d{4})-(\d{2})$/u.exec(month);
        return match ? `${match[1]}年${Number(match[2])}月` : '対象月';
    }, [month]);

    const postToExtension = useCallback((type: string, data: Record<string, unknown> = {}) => {
        window.postMessage({
            source: APP_SOURCE,
            version: PROTOCOL_VERSION,
            type,
            ...data
        }, window.location.origin);
    }, []);

    const pingExtensionVersions = useCallback(() => {
        postToExtension('COMIRU_EXTENSION_PING');
        window.postMessage({
            source: APP_SOURCE,
            version: 1,
            type: 'COMIRU_EXTENSION_PING'
        }, window.location.origin);
    }, [postToExtension]);

    const checkConnection = useCallback(() => {
        setConnection('checking');
        setStatusMessage('Chrome拡張との接続を確認しています…');
        pingExtensionVersions();

        if (missingTimer.current !== null) window.clearTimeout(missingTimer.current);
        missingTimer.current = window.setTimeout(() => {
            setConnection(current => current === 'ready' ? current : 'missing');
            setStatusMessage(current => current.includes('取得') ? current : '初回のみChrome拡張の設定が必要です。');
        }, 1800);
    }, [pingExtensionVersions]);

    useEffect(() => {
        const receiveExtensionMessage = (event: MessageEvent) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            if (!event.data || typeof event.data !== 'object') return;

            const envelope = event.data as ExtensionEnvelope;
            if (envelope.source !== EXTENSION_SOURCE || typeof envelope.type !== 'string') return;

            if (envelope.type === 'COMIRU_EXTENSION_READY' && envelope.version === 1) {
                if (missingTimer.current !== null) window.clearTimeout(missingTimer.current);
                setConnection('outdated');
                setStatusMessage(`Chrome拡張を${EXTENSION_VERSION}へ更新してください。`);
                return;
            }

            if (envelope.version !== PROTOCOL_VERSION) return;
            const message = getPayload(envelope);

            if (envelope.type === 'COMIRU_EXTENSION_READY') {
                if (missingTimer.current !== null) window.clearTimeout(missingTimer.current);
                setConnection('ready');
                setStatusMessage(current => current.includes('取得') ? current : 'Chrome連携の準備ができています。');
                return;
            }

            const requestId = typeof message.requestId === 'string' ? message.requestId : '';
            if (!requestId) return;
            const responseCampusId = typeof message.campusId === 'string' ? message.campusId : '';
            const responseTenant = typeof message.tenant === 'string' ? message.tenant : '';
            if (responseCampusId !== campusId || responseTenant !== comiruTenant) {
                if (envelope.type === 'COMIRU_CSV_READY') {
                    postToExtension('COMIRU_CSV_ACK', {
                        requestId,
                        campusId: responseCampusId,
                        tenant: responseTenant,
                        ok: false,
                        message: 'Campus changed before CSV delivery'
                    });
                }
                return;
            }

            if (envelope.type === 'COMIRU_CSV_READY') {
                if (activeRequestId.current && requestId !== activeRequestId.current) return;
                if (handledRequestIds.current.has(requestId)) {
                    postToExtension('COMIRU_CSV_ACK', {
                        requestId,
                        campusId: responseCampusId,
                        tenant: responseTenant,
                        ok: true
                    });
                    return;
                }

                const base64 = typeof message.base64 === 'string' ? message.base64 : '';
                if (!base64 || base64.length > MAX_BASE64_LENGTH) {
                    setImportState('error');
                    setStatusMessage('取得したCSVのサイズを確認できませんでした。');
                    postToExtension('COMIRU_CSV_ACK', {
                        requestId,
                        campusId: responseCampusId,
                        tenant: responseTenant,
                        ok: false,
                        message: 'CSV size validation failed'
                    });
                    activeRequestId.current = null;
                    return;
                }

                try {
                    const receivedMonth = typeof message.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(message.startDate)
                        ? message.startDate.slice(0, 7)
                        : month;
                    const range = getMonthRange(receivedMonth);
                    const fileName = `指導報告書_${range.compact}.csv`;
                    const mimeType = typeof message.mimeType === 'string' ? message.mimeType : 'text/csv';
                    const file = decodeBase64File(base64, fileName, mimeType);
                    handledRequestIds.current.add(requestId);
                    postToExtension('COMIRU_CSV_ACK', {
                        requestId,
                        campusId: responseCampusId,
                        tenant: responseTenant,
                        ok: true
                    });
                    setImportState('success');
                    const rowNote = typeof message.rowCount === 'number' ? `（${message.rowCount}件）` : '';
                    setStatusMessage(`CSVを取得しました${rowNote}。集計を開始します…`);
                    activeRequestId.current = null;
                    void onFileSelectRef.current(file, 'auto');
                } catch (error) {
                    console.error(error);
                    setImportState('error');
                    setStatusMessage('取得したCSVを読み込めませんでした。もう一度お試しください。');
                    postToExtension('COMIRU_CSV_ACK', {
                        requestId,
                        campusId: responseCampusId,
                        tenant: responseTenant,
                        ok: false,
                        message: 'CSV decode failed'
                    });
                    activeRequestId.current = null;
                }
                return;
            }

            if (requestId !== activeRequestId.current) return;

            if (envelope.type === 'COMIRU_IMPORT_STATUS') {
                setImportState('working');
                setStatusMessage(typeof message.message === 'string' ? message.message : 'Comiruから指導報告書を取得しています…');
                return;
            }

            if (envelope.type === 'COMIRU_IMPORT_ERROR') {
                setImportState('error');
                setStatusMessage(typeof message.message === 'string' ? message.message : 'ComiruからCSVを取得できませんでした。');
                activeRequestId.current = null;
                return;
            }
        };

        window.addEventListener('message', receiveExtensionMessage);
        pingExtensionVersions();
        missingTimer.current = window.setTimeout(() => {
            setConnection(current => current === 'ready' ? current : 'missing');
            setStatusMessage(current => current.includes('取得') ? current : '初回のみChrome拡張の設定が必要です。');
        }, 1800);
        return () => {
            window.removeEventListener('message', receiveExtensionMessage);
            if (missingTimer.current !== null) window.clearTimeout(missingTimer.current);
        };
    }, [campusId, comiruTenant, month, pingExtensionVersions, postToExtension]);

    const startImport = () => {
        if (!comiruTenant) {
            setImportState('error');
            setStatusMessage(`${campusName}のComiru校舎コードを集計設定で入力してください。`);
            return;
        }
        if (connection !== 'ready') {
            setImportState('error');
            setStatusMessage('Chrome拡張を設定し、このページを再読み込みしてください。');
            return;
        }

        try {
            const range = getMonthRange(month);
            const requestId = crypto.randomUUID();
            activeRequestId.current = requestId;
            setImportState('working');
            setStatusMessage(`${monthLabel}のComiru指導報告書を開いています…`);
            postToExtension('COMIRU_IMPORT_REQUEST', {
                requestId,
                campusId,
                tenant: comiruTenant,
                startDate: range.startDate,
                endDate: range.endDate
            });
        } catch (error) {
            setImportState('error');
            setStatusMessage(error instanceof Error ? error.message : '対象月を確認してください。');
        }
    };

    const isWorking = importState === 'working' || isProcessing;
    const tenantConfigured = /^[a-z0-9-]{1,80}$/u.test(comiruTenant);
    const visibleStatusMessage = tenantConfigured
        ? statusMessage
        : `${campusName}のComiru校舎コードを集計設定で入力してください。`;

    return (
        <section className="comiru-import-card" aria-labelledby="comiru-import-title">
            <div className="comiru-import-heading">
                <div className="comiru-import-title-row">
                    <span className="comiru-import-icon" aria-hidden="true"><CloudDownload size={20} /></span>
                    <div>
                        <small>AUTOMATIC IMPORT</small>
                        <h3 id="comiru-import-title">Comiruから自動取得</h3>
                    </div>
                </div>
                <span className={`extension-state is-${connection}`}>
                    {connection === 'ready' ? <CheckCircle2 size={13} /> : connection === 'checking' ? <Loader2 size={13} className="animate-spin" /> : connection === 'outdated' ? <TriangleAlert size={13} /> : <Puzzle size={13} />}
                    {connection === 'ready' ? 'Chrome連携済み' : connection === 'checking' ? '確認中' : connection === 'outdated' ? '更新が必要' : '初回設定が必要'}
                </span>
            </div>

            <p className="comiru-import-description">
                {campusName}の対象月を選ぶと、全件表示・全選択・CSV取得を自動で行います。CSVはPCへ保存せず、そのまま集計を開始します。
            </p>

            <div className="comiru-import-controls">
                <label>
                    <span><CalendarDays size={14} /> 対象月</span>
                    <input type="month" value={month} onChange={event => setMonth(event.target.value)} disabled={isWorking} />
                </label>
                <button type="button" onClick={startImport} disabled={isWorking || connection !== 'ready' || !tenantConfigured}>
                    {isWorking ? <Loader2 size={17} className="animate-spin" /> : <CloudDownload size={17} />}
                    {isWorking ? '取得しています…' : `${monthLabel}を取得`}
                </button>
            </div>

            <div className={`comiru-import-status is-${importState} ${connection === 'missing' || connection === 'outdated' || !tenantConfigured ? 'is-missing' : ''}`} role="status" aria-live="polite">
                {importState === 'error' || connection === 'missing' || connection === 'outdated' || !tenantConfigured ? <TriangleAlert size={15} /> : importState === 'success' ? <CheckCircle2 size={15} /> : importState === 'working' || connection === 'checking' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                <span>{visibleStatusMessage}</span>
                {(connection === 'missing' || connection === 'outdated') && (
                    <button type="button" onClick={checkConnection} aria-label="Chrome連携を再確認">
                        <RefreshCw size={14} /> 再確認
                    </button>
                )}
            </div>

            {(connection === 'missing' || connection === 'outdated') && (
                <div className="extension-setup">
                    <div>
                        <strong>{connection === 'outdated' ? `専用Chrome拡張を${EXTENSION_VERSION}へ更新します` : '初回のみ、専用Chrome拡張を追加します'}</strong>
                        <p>{connection === 'outdated' ? '新版ZIPを展開して既存フォルダを置き換え、Chromeの拡張機能画面で再読み込みします。' : 'ZIPを展開し、Chromeの拡張機能画面で「パッケージ化されていない拡張機能を読み込む」を選びます。'}</p>
                    </div>
                    <a href={`/work-summary-comiru-extension.zip?v=${EXTENSION_VERSION}`} download={`work-summary-comiru-extension-v${EXTENSION_VERSION}.zip`}>
                        <Puzzle size={15} /> {connection === 'outdated' ? '新版をダウンロード' : '拡張機能をダウンロード'}
                    </a>
                </div>
            )}
        </section>
    );
};
