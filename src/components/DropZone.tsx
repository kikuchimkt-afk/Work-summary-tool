import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface DropZoneProps {
    onFileSelect: (file: File, encoding: string) => void;
    isProcessing: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelect, isProcessing }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [encoding, setEncoding] = useState('auto');

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileSelect(e.dataTransfer.files[0], encoding);
        }
    }, [onFileSelect, encoding]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelect(e.target.files[0], encoding);
        }
    }, [onFileSelect, encoding]);

    return (
        <div
            className={`
                border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-colors
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
                ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
        >
            <input
                type="file"
                id="file-input"
                className="hidden"
                accept=".csv"
                onChange={handleFileChange}
            />

            {isProcessing ? (
                <div className="flex flex-col items-center animate-pulse">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <h3 className="text-lg font-bold text-gray-700">処理中...</h3>
                </div>
            ) : (
                <>
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />

                    <h3 className="text-lg font-bold text-gray-700 mb-1">CSVファイルをここにドロップ</h3>
                    <p className="text-sm text-gray-500 mb-6">またはクリックして選択</p>
                </>
            )}

            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <label className="text-xs text-gray-500">文字コード:</label>
                <select
                    value={encoding}
                    onChange={e => setEncoding(e.target.value)}
                    className="text-xs border border-gray-300 rounded p-1 bg-white"
                >
                    <option value="auto">自動判定</option>
                    <option value="UTF-8">UTF-8</option>
                    <option value="Shift_JIS">Shift-JIS</option>
                </select>
            </div>
        </div>
    );
};
