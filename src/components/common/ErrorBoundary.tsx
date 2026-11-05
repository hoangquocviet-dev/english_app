import { Component, type ErrorInfo, type ReactNode } from 'react'
import { storageService } from '../../utils/storage'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleReset = (): void => {
    if (window.confirm('Khôi phục toàn bộ dữ liệu mẫu ban đầu để khắc phục lỗi?')) {
      storageService.resetToDefaults()
      window.location.reload()
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold mb-2">Đã xảy ra sự cố hiển thị</h2>
          <p className="text-sm text-slate-400 max-w-sm mb-6">
            Hệ thống đã tự động bảo vệ dữ liệu học tập của bạn an toàn. Vui lòng thử tải lại trang hoặc khôi phục dữ liệu gốc.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              onClick={this.handleReload}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors active:scale-95"
            >
              Tải lại ứng dụng
            </button>
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm border border-slate-700 transition-colors active:scale-95"
            >
              Khôi phục dữ liệu mẫu
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
