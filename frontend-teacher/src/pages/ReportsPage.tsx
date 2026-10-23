import { DepthScene } from "../components/depth/DepthScene";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import { Download, FilePlus2, ArrowLeft, FileText } from "lucide-react";
import { teacherApi } from "../api/teacher";
import type { ReportItem, StudentCard } from "../types";
import { Metric, PageTitle, State, fmt } from "../components/Ui";
import { AssessmentReport } from "../components/AssessmentReport";
import { navigate } from "../router";
const statusName = (s: string) => ({ approved: "已生成", generating: "生成中", failed: "生成失败" })[s] || s;
export function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]),
    [students, setStudents] = useState<StudentCard[]>([]),
    [studentId, setStudentId] = useState(0),
    [rangeDays, setRangeDays] = useState(30),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [notice, setNotice] = useState("");
  const load = () =>
    Promise.all([teacherApi.reports({ pageSize: 100 }), teacherApi.students({ pageSize: 100 })])
      .then(([a, b]) => {
        setReports(a.data);
        setStudents(b.data);
        setStudentId((current) => current || b.data[0]?.studentId || 0);
      })
      .finally(() => setLoading(false));
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const create = async () => {
    if (!studentId) return;
    setCreating(true);
    setError("");
    try {
      const item = await teacherApi.createReport(studentId, { reportType: "period_assessment", rangeDays });
      await load();
      if (item.status === "approved") navigate(`/reports/${item.id}`);
      else
        setNotice(
          item.status === "failed" ? "该快照生成失败，请检查 PDF 服务后重试。" : "报告正在生成，请稍后刷新。",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "报告生成失败");
    } finally {
      setCreating(false);
    }
  };
  const visible = reports.filter((r) => !filter || r.studentName?.includes(filter));
  return (
    <>
      <PageTitle title="学习评估报告" description="从学习证据到复习计划，为每一次教学跟进留下记录" />
      <div className="assessment-generator">
        <div>
          <FileText size={22} />
          <h2>生成阶段评估</h2>
          <p>选择学生与周期，查看报告并导出 PDF</p>
        </div>
        <div className="analytics-toolbar">
          <select
            aria-label="选择学生"
            value={studentId}
            onChange={(e) => setStudentId(Number(e.target.value))}
          >
            {!students.length && <option value={0}>暂无可选学生</option>}
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.displayName} · {s.className}
              </option>
            ))}
          </select>
          <select
            aria-label="报告周期"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>
          <button onClick={create} disabled={creating || !studentId}>
            <FilePlus2 size={16} />
            {creating ? "正在生成…" : "生成并预览"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="analytics-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="analytics-note">
          {notice}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Metric label="已生成报告" value={reports.filter((r) => r.status === "approved").length} />
        <Metric label="覆盖学生" value={new Set(reports.map((r) => r.studentId)).size} />
        <Metric label="最近生成" value={reports[0] ? fmt(reports[0].createdAt) : "暂无记录"} />
      </div>
      <div className="analytics-toolbar">
        <h2>报告档案</h2>
        <input
          aria-label="搜索报告学生"
          placeholder="按学生姓名搜索"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <small>展示最近 100 份报告</small>
        <button onClick={() => load().catch((e) => setError(e.message))}>刷新</button>
      </div>
      <State loading={loading} empty={!visible.length}>
        <div className="analytics-table">
          <table>
            <thead>
              <tr>
                <th>学生 / 报告</th>
                <th>评估周期</th>
                <th>状态</th>
                <th>生成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button onClick={() => navigate(`/reports/${item.id}`)}>
                      {item.studentName || `学生 #${item.studentId}`}
                    </button>
                    <small>学习评估 · V{item.reportVersion}</small>
                  </td>
                  <td>{item.rangeDays} 天</td>
                  <td>{statusName(item.status)}</td>
                  <td>{fmt(item.createdAt)}</td>
                  <td>
                    <button onClick={() => navigate(`/reports/${item.id}`)}>查看报告</button>
                    <button
                      aria-label={`下载${item.studentName || "学生"}的报告`}
                      disabled={item.status !== "approved"}
                      onClick={() => teacherApi.downloadReport(item).catch((e) => setError(e.message))}
                    >
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
      <DepthScene variant="sheet" section="SECTION 08" title={["ARCHIVE", ""]}
        caption="REPORT ARCHIVE / 学习报告" meta={!loading && !error ? `${reports.length} FILES` : undefined} />
    </>
  );
}
export function ReportDetailPage({ reportId }: { reportId: number }) {
  const [data, setData] = useState<ReportItem>(),
    [error, setError] = useState(""),
    [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError("");
    teacherApi
      .report(reportId)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);
  return (
    <>
      <PageTitle
        title="学习评估报告"
        description="查看学习证据、诊断结果与教学跟进计划"
        action={
          <div className="analytics-toolbar">
            <button onClick={() => navigate("/reports")}>
              <ArrowLeft size={16} />
              返回档案
            </button>
            {data?.status === "approved" && (
              <button
                onClick={() => teacherApi.downloadReport(data).catch((e) => setDownloadError(e.message))}
              >
                <Download size={16} />
                下载 PDF
              </button>
            )}
          </div>
        }
      />
      {downloadError && (
        <p role="alert" className="analytics-alert">
          {downloadError}
        </p>
      )}
      <State loading={!data && !error} error={error}>
        {data && (
          <>
            <AssessmentReport item={data} />
            <p className="assessment-note">
              生成时间：{fmt(data.createdAt)} · {statusName(data.status)} · 历史报告保存生成时的数据快照
            </p>
            <details className="assessment-note">
              <summary>文件校验信息</summary>
              <p className="break-all">{data.checksumSha256 || "PDF 尚未生成"}</p>
            </details>
          </>
        )}
      </State>
    </>
  );
}
