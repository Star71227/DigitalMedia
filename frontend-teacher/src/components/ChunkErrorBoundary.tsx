/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  failed: boolean;
}

export default class ChunkErrorBoundary extends Component<Props, State> {
  declare props: Readonly<Props>;
  declare setState: (state: State) => void;
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <h2 className="font-semibold text-amber-900">页面资源加载失败</h2>
        <p className="mt-2 text-sm text-amber-800">部署版本可能刚刚更新，刷新后可重新获取匹配的页面资源。</p>
        <button
          type="button"
          className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => window.location.reload()}
        >
          刷新重试
        </button>
      </div>
    );
  }
}
