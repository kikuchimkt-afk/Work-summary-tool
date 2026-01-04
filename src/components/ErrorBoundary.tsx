import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-800 min-h-screen flex flex-col items-center justify-center">
                    <h1 className="text-2xl font-bold mb-4">エラーが発生しました</h1>
                    <p className="mb-4">以下のエラー内容を開発者に伝えてください:</p>
                    <pre className="bg-white p-4 rounded border border-red-200 text-sm overflow-auto max-w-2xl">
                        {this.state.error?.toString()}
                        <br />
                        {this.state.error?.stack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        ページをリロード
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
