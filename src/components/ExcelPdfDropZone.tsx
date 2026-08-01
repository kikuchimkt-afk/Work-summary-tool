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
        setMessage('Excelを読み込んでいます...');
        setProgress(null);
        try {
            const { createTeacherPdfArchive, downloadBlob } = await import('../utils/excelPdfExporter');
            const archive = await createTeacherPdfArchive(file, current => {
                setProgress(current);
                setMessage(`${current.teacher}のPDFを作成中...`);
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
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                    <FileArchive size={22} />
                </div>
                <div>
                    <h2 className="font-bold text-gray-800">修正済みExcelから講師別PDFを作成</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        数字を手直しした勤務集計Excelを読み込み、各講師タブをA4縦PDFにしてZIPでまとめます。
                    </p>
                </div>
            </div>

            <div
                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-rose-500 bg-rose-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'} ${isProcessing ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}
                onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={event => { event.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                onClick={() => !isProcessing && inputRef.current?.click()}
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

                {isProcessing ? (
                    <Loader2 className="w-10 h-10 text-rose-500 animate-spin mb-3" />
                ) : (
                    <FileSpreadsheet className="w-10 h-10 text-gray-400 mb-3" />
                )}
                <p className="font-semibold text-gray-700">
                    {isProcessing ? message : '修正済みExcelをここにドロップ'}
                </p>
                {!isProcessing && <p className="text-sm text-gray-500 mt-1">またはクリックして選択</p>}

                {isProcessing && progress && (
                    <div className="w-full max-w-md mt-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{progress.current} / {progress.total}</span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 transition-all" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                )}
            </div>

            {status === 'success' && (
                <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                    <CheckCircle2 size={18} />
                    {message}
                </div>
            )}
            {status === 'error' && (
                <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                    <AlertCircle size={18} />
                    {message}
                </div>
            )}
        </section>
    );
};
