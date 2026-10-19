/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState } from "react";
import { describeApiError, getProfileHistory, type ProfileHistoryItem } from "../../api";
import { sourceLabel } from "./ProfileDimensionCard";

export default function ProfileVersionHistory({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<ProfileHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await getProfileHistory());
    } catch (reason) {
      setError(describeApiError(reason, "画像历史读取失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <details
      className="lm-profile-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-expanded={open}>
        <span>
          <strong>更新历史</strong>
          <small>{loading ? "正在读取" : items.length ? `${items.length} 次已保存更新` : "暂无历史"}</small>
        </span>
        <span aria-hidden="true">{open ? "收起" : "展开"}</span>
      </summary>
      <div className="lm-profile-disclosure__body">
        {loading ? (
          <p className="lm-profile-disclosure__empty" role="status">
            正在读取画像更新历史…
          </p>
        ) : error ? (
          <div className="lm-profile-history-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="lm-profile-disclosure__empty">确认第一份学习画像后，这里会显示更新记录。</p>
        ) : (
          <ol className="lm-profile-history-list">
            {items.map((item) => (
              <li key={item.version}>
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                <div>
                  <strong>{item.reason || "学习画像已更新"}</strong>
                  <small>{sourceLabel(item.sourceType)}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
