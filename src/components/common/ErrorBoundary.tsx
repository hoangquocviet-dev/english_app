import { Component, type ErrorInfo, type ReactNode } from 'react'
import { forceReloadApp } from '../../utils/reload'
import { storageService } from '../../utils/storage'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  confirmingReset: boolean
  backupSaved: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    confirmingReset: false,
    backupSaved: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, confirmingReset: false, backupSaved: false }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
  }

  private handleReload = (): void => {
    void forceReloadApp()
  }

  private handleDownloadRescueBackup = (): void => {
    try {
      const json = storageService.exportFullProfileSnapshot()
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vocabflow-rescue-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      this.setState({ backupSaved: true })
    } catch {}
  }

  private handleConfirmReset = (): void => {
    void storageService.resetToDefaults().then(() => {
      void forceReloadApp()
    })
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-500 flex items-center justify-center mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold mb-2">Đã xảy ra sự cố hiển thị</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
            Hệ thống đã tự động bảo vệ dữ liệu học tập của bạn an toàn. Bạn có thể tải bản sao lưu
            cứu hộ (.json) hoặc tải lại trang ngay.
          </p>

          {this.state.backupSaved && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
              ✓ Đã tải xuống file sao lưu cứu hộ (.json) an toàn!
            </p>
          )}

          {!this.state.confirmingReset ? (
            <div className="flex flex-col gap-2.5 w-full max-w-xs">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors active:scale-95"
              >
                Tải lại ứng dụng
              </button>
              <button
                type="button"
                onClick={this.handleDownloadRescueBackup}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold text-xs border border-emerald-500/30 transition-colors active:scale-95"
              >
                Tải bản sao lưu cứu hộ (.json)
              </button>
              <button
                type="button"
                onClick={() => this.setState({ confirmingReset: true })}
                className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 transition-colors active:scale-95"
              >
                Khôi phục dữ liệu mẫu
              </button>
            </div>
          ) : (
            <div className="w-full max-w-xs p-4 rounded-2xl bg-white dark:bg-slate-800 border border-rose-500/30 space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Xác nhận đặt lại về kho từ mẫu ban đầu?
              </p>
              {!this.state.backupSaved && (
                <button
                  type="button"
                  onClick={this.handleDownloadRescueBackup}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-500/25"
                >
                  Sao lưu tiến độ ra file .json trước
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => this.setState({ confirmingReset: false })}
                  className="py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={this.handleConfirmReset}
                  className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                >
                  Đồng ý đặt lại
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
