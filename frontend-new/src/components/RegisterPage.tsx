/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { describeApiError, registerStudent } from "../api";
import DotField from "./DotField";
import LoginHero from "./LoginHero";

interface RegisterPageProps {
  onBackToLogin: (username?: string, registrationComplete?: boolean) => void;
}

export default function RegisterPage({ onBackToLogin }: RegisterPageProps) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    const normalizedName = name.trim();

    if (!/^[A-Za-z0-9_-]{4,32}$/.test(normalizedUsername)) {
      setError("用户名或学号需为4至32位字母、数字、下划线或连字符。");
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

    setSubmitting(true);
    setError("");
    try {
      await registerStudent({
        username: normalizedUsername,
        name: normalizedName,
        password,
        confirmPassword,
      });
      onBackToLogin(normalizedUsername, true);
    } catch (registrationError) {
      setError(describeApiError(registrationError, "注册失败，请稍后重试。"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="lm-login-page" id="main-content">
      <DotField />
      <div className="lm-login-layout">
        <LoginHero />
        <section className="lm-login-panel" aria-labelledby="register-title">
          <button
            type="button"
            className="lm-auth-back"
            onClick={() => onBackToLogin(username.trim())}
            disabled={submitting}
          >
            <ArrowLeft aria-hidden="true" /> 返回登录
          </button>
          <h2 id="register-title">创建学生账号</h2>
          <p className="lm-login-panel__intro">注册成功后请使用新账号登录，密码不会保存到浏览器。</p>

          <form className="lm-login-form lm-register-form" onSubmit={handleSubmit} noValidate>
            <div className="lm-form-field">
              <label htmlFor="register-username">学号或用户名</label>
              <input
                id="register-username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
                placeholder="4至32位字母、数字、下划线或连字符"
              />
            </div>

            <div className="lm-form-field">
              <label htmlFor="register-name">姓名</label>
              <input
                id="register-name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                disabled={submitting}
                placeholder="请输入姓名"
              />
            </div>

            <div className="lm-form-field">
              <label htmlFor="register-password">密码</label>
              <div className="lm-password-field">
                <input
                  id="register-password"
                  name="password"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={submitting}
                  aria-describedby="register-password-help"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                  aria-pressed={passwordVisible}
                  disabled={submitting}
                >
                  {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              <p className="lm-login-help" id="register-password-help">
                8至64位，同时包含字母和数字。
              </p>
            </div>

            <div className="lm-form-field">
              <label htmlFor="register-confirm-password">确认密码</label>
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type={passwordVisible ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="lm-login-error" role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="lm-button lm-button--primary lm-login-submit"
              disabled={submitting}
              aria-busy={submitting}
            >
              <span>{submitting ? "正在创建账号" : "创建学生账号"}</span>
              {!submitting && <ArrowRight aria-hidden="true" />}
            </button>

            <button
              type="button"
              className="lm-auth-link"
              onClick={() => onBackToLogin(username.trim())}
              disabled={submitting}
            >
              已有账号？返回登录
            </button>
          </form>
        </section>
      </div>

      <footer className="lm-login-footer">智课研伴 · 学生与教师均可自助注册，管理员账号由平台分配</footer>
    </main>
  );
}
