import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fafafa] dark:bg-[#0b0b0d] text-neutral-900 dark:text-white transition-colors">
                    <div className="text-center px-6">
                        <h1 className="text-lg font-medium mb-2">Something went wrong</h1>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 max-w-md">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="px-4 py-2 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300/60 dark:hover:bg-neutral-700/60 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;