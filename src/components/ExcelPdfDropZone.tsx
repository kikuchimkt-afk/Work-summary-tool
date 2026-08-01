import { useCallback, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileArchive, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { PdfExportProgress } from '../utils/excelPdfExporter';

type Status = 'idle' | 'processing' | 'success' | 'error';

export const ExcelPdfDropZone = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState<PdfExportProgress | null>(null);

    const processFile = useCallback(async (file: File) => {
        if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
            setStatus('error');
            setMessage('Excelファイル（.xlsx、.xlsm、.xls）を選択してください。');
            return;
        }

        setStatus('processing');
        setMessage('Excelを読み込んでいます…');
        setProgress(null);
        try {
            const { createTeacherPdfArchive, downloadBlob } = await import('../utils/excelPdfExporter');
            const archive = await createTeacherPdfArchive(file, current => {
                setProgress(current);
                setMessage(`${current.teacher}のPDFを作成中…`);
            });
            downloadBlob(archive.blob, archive.fileName);
            setStatus('success');
            setMessage(`${archive.pdfCount}名分の講師別PDFをZIPでダウンロードしました。`);
        } catch (error) {
            console.error(error);
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'PDFの作成中にエラーが発生しました。');
        } finally {
            if (inputRef.current) inputRef.current.value = '';
        }
    }, []);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void processFile(file);
    }, [processFile]);

    const isProcessing = status === 'processing';
    const progressPercent = progress ? Math.round(progress.current / progress.total * 100) : 0;

    return (
        <section className="pdf-workflow-card">
            <div className="pdf-workflow-copy">
                <p className="eyebrow">STEP 02 · PDF EXPORT</p>
                <div className="pdf-title-row">
                    <span className="pdf-title-icon"><FileArchive size={22} /></span>
                    <div>
                        <h2>修正済みExcelから<br />講師別PDFを作成</h2>
                        <p>手直ししたExcelを読み込み、各講師のシートを印刷しやすいPDFにまとめます。</p>
                    </div>
                </div>
                <div className="pdf-features">
                    <span>各講師ごとに分割</span>
                    <span>A4縦で出力</span>
                    <span>ZIPで一括保存</span>
                </div>
            </div>

            <div className="pdf-workflow-action">
                <div
                    className={`excel-dropzone ${isDragging ? 'is-dragging' : ''} ${isProcessing ? 'is-processing' : ''}`}
                    onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
                    onDragLeave={event => { event.preventDefault(); setIsDragging(false); }}
                    onDrop={handleDrop}
                    onClick={() => !isProcessing && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                        if ((event.key === 'Enter' || event.key === ' ') && !isProcessing) inputRef.current?.click();
                    }}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xlsm,.xls"
                        onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) void processFile(file);
                        }}
                    />

                    <span className="excel-icon">
                        {isProcessing ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                    </span>
                    <div>
                        <strong>{isProcessing ? message : '修正済みExcelをドロップ'}</strong>
                        {!isProcessing && <p>またはクリックしてファイルを選択</p>}
                    </div>

                    {isProcessing && progress && (
                        <div className="pdf-progress">
                            <div>
                                <span>{progress.current} / {progress.total}</span>
                                <span>{progressPercent}%</span>
                            </div>
                            <div className="progress-track">
                                <span style={{ width: `${progressPercent}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {status === 'success' && (
                    <div className="inline-status success"><CheckCircle2 size={18} />{message}</div>
                )}
                {status === 'error' && (
                    <div className="inline-status error"><AlertCircle size={18} />{message}</div>
                )}
            </div>
        </section>
    );
};
