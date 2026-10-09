import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#141414] border border-[#3a2222] rounded-xl text-center m-4">
          <div className="p-3 rounded-full bg-[#2a1717] border border-[#4a2222] text-[#f87171] mb-3">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-sm font-semibold text-white">
            {this.props.fallbackTitle || "Komponen mengalami error saat render"}
          </h3>
          <p className="text-xs text-[#888888] font-mono mt-1.5 max-w-md break-words">
            {this.state.error?.message || "Terjadi kesalahan internal"}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222222] hover:bg-[#2c2c2c] text-white border border-[#3e3e3e] text-xs font-medium transition-colors"
          >
            <RefreshCw size={12} />
            <span>Muat Ulang Tampilan</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
