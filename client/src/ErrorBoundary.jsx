import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <strong>حدث خطأ غير متوقع</strong>
          <p>حاول تحديث الصفحة أو تواصل مع المسؤول إذا استمرت المشكلة.</p>
          <button className="button primary" type="button" onClick={() => window.location.reload()}>
            تحديث الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
