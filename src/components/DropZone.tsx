import React, { useCallback, useRef, useState } from 'react';
import { FileText, LoaderCircle, UploadCloud } from 'lucide-react';

interface DropZoneProps {
    onFileSelect: (file: File, encoding: string) => void;
    isProcessing: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelect, isProcessing }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [encoding, setEncoding] = useState('auto');

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFileSelect(file, encoding);
    }, [onFileSelect, encoding]);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) onFileSelect(file, encoding);
    }, [onFileSelect, encoding]);

    return (
        <div
            className={`csv-dropzone ${isDragging ? 'is-dragging' : ''} ${isProcessing ? 'is-processing' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
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
                accept=".csv"
                onChange={handleFileChange}
            />

            <div className="dropzone-icon" aria-hidden="true">
                {isProcessing ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}
            </div>
            <div className="dropzone-copy">
                <small>STEP 01</small>
                <h3>{isProcessing ? '勤務データを整えています…' : '指導報告書CSVを読み込む'}</h3>
                <p>{isProcessing ? '内容を確認しながら集計しています。' : 'ここにドロップ、またはクリックして選択'}</p>
            </div>

            {!isProcessing && (
                <div className="dropzone-meta">
                    <span><FileText size={14} /> CSVファイル</span>
                    <label onClick={event => event.stopPropagation()}>
                        <span>文字コード</span>
                        <select value={encoding} onChange={event => setEncoding(event.target.value)}>
                            <option value="auto">自動判定</option>
                            <option value="UTF-8">UTF-8</option>
                            <option value="Shift_JIS">Shift-JIS</option>
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
};
