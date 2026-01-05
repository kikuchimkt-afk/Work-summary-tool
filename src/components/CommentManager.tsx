import React, { useState } from 'react';
import { Save, Trash2, Edit2, Plus } from 'lucide-react';

interface CommentManagerProps {
    teachers: string[];
    comments: Record<string, string>;
    onUpdateComments: (newComments: Record<string, string>) => void;
}

export const CommentManager: React.FC<CommentManagerProps> = ({
    teachers,
    comments,
    onUpdateComments
}) => {
    const [selectedTarget, setSelectedTarget] = useState<string>('全体集計');
    const [inputText, setInputText] = useState<string>('');
    const [editingTarget, setEditingTarget] = useState<string | null>(null);

    const targets = ['全体集計', ...teachers];

    const handleSave = () => {
        if (!inputText.trim()) return;

        const target = editingTarget || selectedTarget;
        onUpdateComments({
            ...comments,
            [target]: inputText
        });

        setInputText('');
        setEditingTarget(null);
        if (editingTarget) {
            // If we were editing, valid to switch back or stay? 
            // Strategy: Stay on same input but clear it? Or select the target we just edited?
            setSelectedTarget(target);
        }
    };

    const handleEdit = (target: string) => {
        setInputText(comments[target] || '');
        setEditingTarget(target);
        setSelectedTarget(target);
    };

    const handleDelete = (target: string) => {
        const newComments = { ...comments };
        delete newComments[target];
        onUpdateComments(newComments);

        if (editingTarget === target) {
            setEditingTarget(null);
            setInputText('');
        }
    };

    const handleCancelEdit = () => {
        setEditingTarget(null);
        setInputText('');
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    {editingTarget ? (
                        <>
                            <Edit2 size={16} />
                            <span>コメントを編集: {editingTarget}</span>
                        </>
                    ) : (
                        <>
                            <Plus size={16} />
                            <span>新しいコメントを追加</span>
                        </>
                    )}
                </h4>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">対象シート</label>
                        <select
                            value={selectedTarget}
                            onChange={(e) => {
                                setSelectedTarget(e.target.value);
                                if (editingTarget && e.target.value !== editingTarget) {
                                    setEditingTarget(null);
                                    setInputText('');
                                }
                            }}
                            disabled={!!editingTarget}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                            {targets.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">コメント内容</label>
                        <textarea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="シート上部に表示するコメントを入力..."
                        />
                    </div>

                    <div className="flex gap-2 justify-end">
                        {editingTarget && (
                            <button
                                onClick={handleCancelEdit}
                                className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                            >
                                キャンセル
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!inputText.trim()}
                            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Save size={16} />
                            保存
                        </button>
                    </div>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">登録済みコメント一覧</h4>
                {Object.keys(comments).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">登録されたコメントはありません</p>
                ) : (
                    <div className="space-y-2">
                        {Object.entries(comments).map(([target, text]) => (
                            <div key={target} className="flex items-start justify-between bg-white p-3 border rounded shadow-sm">
                                <div className="flex-1 min-w-0 mr-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 text-xs font-bold text-blue-700 bg-blue-50 rounded border border-blue-100">
                                            {target}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 break-words whitespace-pre-wrap">{text}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button
                                        onClick={() => handleEdit(target)}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                        title="編集"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(target)}
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                        title="削除"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
