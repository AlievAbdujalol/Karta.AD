import React, { Component } from 'react';

export function DefaultErrorFallback({ error, onReset }) {
  return (
    <div className="min-h-[250px] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-md flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto my-8">
      <div className="w-12 h-12 bg-red-50 dark:bg-red-950/50 rounded-full flex items-center justify-center text-red-500 text-xl font-bold">
        ⚠️
      </div>
      <div>
        <h2 className="font-bold text-gray-800 dark:text-gray-100 text-base">Что-то пошло не так</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {error?.message || "Произошла непредвиденная ошибка в этом разделе."}
        </p>
      </div>
      <button
        onClick={onReset || (() => window.location.reload())}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
      >
        Перезагрузить страницу
      </button>
    </div>
  );
}

export function BusMapErrorFallback({ error }) {
  return (
    <div className="w-full h-full min-h-[300px] bg-slate-100 dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 text-xl">
        📍
      </div>
      <div>
        <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">Не удалось загрузить карту</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[240px] mx-auto">
          Произошла ошибка при инициализации карты. Пожалуйста, попробуйте перезагрузить страницу или проверьте интернет-соединение.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
      >
        Перезагрузить страницу
      </button>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error.message, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }
      return (
        <DefaultErrorFallback
          error={this.state.error}
          onReset={() => {
            this.setState({ hasError: false, error: null });
            if (this.props.onReset) this.props.onReset();
            else window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
