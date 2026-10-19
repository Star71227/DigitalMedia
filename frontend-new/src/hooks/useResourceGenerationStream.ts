/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  getAuthToken,
  getResourceGenerationEventsUrl,
  getResourceGenerationJob,
  type ResourceGenerationSnapshot,
} from "../api";

export function useResourceGenerationStream(jobId: string | null) {
  const [snapshot, setSnapshot] = useState<ResourceGenerationSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "streaming" | "polling" | "closed"
  >("idle");
  const [error, setError] = useState("");
  const lastEventId = useRef(0);

  useEffect(() => {
    if (!jobId) {
      setSnapshot(null);
      setConnectionState("idle");
      return;
    }
    let cancelled = false;
    let controller: AbortController | null = null;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;

    const refresh = async () => {
      const next = await getResourceGenerationJob(jobId);
      if (!cancelled) {
        setSnapshot(next);
        const ids = next.stages.map((item) => Number(item.id) || 0);
        lastEventId.current = Math.max(lastEventId.current, ...ids, 0);
      }
      return next;
    };
    const poll = async () => {
      if (cancelled) return;
      setConnectionState("polling");
      try {
        const next = await refresh();
        setError("");
        if (["completed", "failed"].includes(next.job.status)) {
          setConnectionState("closed");
          return;
        }
      } catch {
        if (!cancelled) setError("实时连接不可用，正在重试任务状态查询。");
      }
      if (!cancelled) pollTimer = window.setTimeout(poll, 2000);
    };
    const connect = async () => {
      setConnectionState("connecting");
      try {
        const initial = await refresh();
        if (["completed", "failed"].includes(initial.job.status)) {
          setConnectionState("closed");
          return;
        }
        controller = new AbortController();
        const response = await fetch(getResourceGenerationEventsUrl(jobId, lastEventId.current), {
          headers: { Accept: "text/event-stream", Authorization: `Bearer ${getAuthToken()}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("stream unavailable");
        setConnectionState("streaming");
        setError("");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            const id = Number(block.match(/^id:\s*(\d+)/m)?.[1] || 0);
            if (id) lastEventId.current = Math.max(lastEventId.current, id);
            const type = block.match(/^event:\s*(\w+)/m)?.[1];
            if (type && type !== "heartbeat") await refresh();
          }
        }
        const current = await refresh();
        if (["completed", "failed"].includes(current.job.status)) setConnectionState("closed");
        else if (!cancelled) reconnectTimer = window.setTimeout(connect, 1200);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError("实时进度连接已中断，已切换为安全轮询。");
        void poll();
      }
    };
    void connect();
    return () => {
      cancelled = true;
      controller?.abort();
      if (pollTimer) window.clearTimeout(pollTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [jobId]);

  return { snapshot, connectionState, error };
}
