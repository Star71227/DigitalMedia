/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Lock, UserRound } from "lucide-react";
import { registerTeacher } from "../api/auth";
import { navigate } from "../router";

export const REGISTER_FLASH_KEY = "learnmate_teacher_flash";

const FIELD =
  "mt-2 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 transition-colors duration-200 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/16";
const INPUT = "w-full bg-transparent py-3 text-slate-900 outline-none";
const LABEL = "block text-xs font-semibold text-slate-900";

export function RegisterPage() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    const normalizedName = name.trim();

    if (!/^[A-Za-z0-9_-]{4,32}$/.test(normalizedUsername)) {
      setError("用户名需为4至32位字母、数字、下划线或连字符。");
      return;
    }
    if (Array.from(normalizedName).length < 2 || Array.from(normalizedName).length > 30) {
      setError("姓名长度需为2至30个字符。");
      return;
    }
    if (
      password.length < 8 ||
      password.length > 64 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setError("密码需为8至64位，并同时包含字母和数字。");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await registerTeacher({
        username: normalizedUsername,
        name: normalizedName,
        password,
        confirmPassword,
      });
      window.sessionStorage.setItem(
        REGISTER_FLASH_KEY,
        `教师账号 ${normalizedUsername} 已创建，请使用新账号登录。`,
      );
      navigate("/login", true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "注册失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lm-login-backdrop flex min-h-screen flex-col bg-slate-50 p-6" id="main-content">
      <div className="relative flex flex-1 items-center justify-center py-10">
        <section
          className="lm-page-enter w-full max-w-[480px] rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
          aria-labelledby="teacher-register-title"
        >
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
          >
            <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
            返回登录
          </button>

          <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"
              aria-hidden="true"
            >
              <BookOpen size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <strong className="block text-lg font-bold leading-tight tracking-tight text-slate-900">
                智课研伴 教师端
              </strong>
              <span className="text-xs text-slate-500">创建 TEACHER 账号</span>
            </div>
          </div>

          <h2
            id="teacher-register-title"
            className="mt-6 text-2xl font-bold leading-[1.35] tracking-tight text-slate-900"
          >
            教师注册
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            填写账号信息即可创建教师账号，创建成功后直接登录教师工作台。
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="register-username" className={LABEL}>
                用户名
              </label>
              <div className={FIELD}>
                <UserRound
                  size={17}
                  strokeWidth={1.8}
                  className="shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="register-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className={INPUT}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={32}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="register-name" className={LABEL}>
                姓名
              </label>
              <div className={FIELD}>
                <UserRound
                  size={17}
                  strokeWidth={1.8}
                  className="shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="register-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={INPUT}
                  autoComplete="name"
                  required
                  maxLength={30}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="register-password" className={LABEL}>
                密码
              </label>
              <div className={FIELD}>
                <Lock size={17} strokeWidth={1.8} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  id="register-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className={INPUT}
                  autoComplete="new-password"
                  required
                  maxLength={64}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="register-confirm" className={LABEL}>
                确认密码
              </label>
              <div className={FIELD}>
                <Lock size={17} strokeWidth={1.8} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  id="register-confirm"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  className={INPUT}
                  autoComplete="new-password"
                  required
                  maxLength={64}
                  disabled={loading}
                />
              </div>
            </div>

            <p className="text-xs leading-5 text-slate-500">
              用户名4至32位字母、数字、下划线或连字符；密码8至64位且同时包含字母和数字。
            </p>
            {error && (
              <div
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand-600 px-5 font-semibold text-white shadow-brand-cta transition-colors duration-200 hover:bg-brand-500 disabled:opacity-60"
            >
              {loading ? "正在创建…" : "创建教师账号"}
            </button>
          </form>

          <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            学生账号请到学生端注册，本页只创建 TEACHER 账号。
          </p>
        </section>
      </div>
      <p className="relative pb-2 text-center text-xs text-slate-500">智课研伴 教师数据中心</p>
    </main>
  );
}
