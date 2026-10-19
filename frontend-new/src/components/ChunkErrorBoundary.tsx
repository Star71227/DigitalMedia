/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Component, type ReactNode } from "react";
import AsyncState from "./ui/AsyncState";

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
      <AsyncState
        kind="error"
        title="这个页面暂时无法打开"
        description="页面资源没有完整加载，其他学习记录不会因此改变。"
        preserved="刷新后会重新获取当前页面，你仍会停留在登录状态允许访问的区域。"
        action={{ label: "刷新重试", onClick: () => window.location.reload() }}
      />
    );
  }
}
