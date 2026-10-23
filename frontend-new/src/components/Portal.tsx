/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import DotField from "./DotField";
import LoginHero from "./LoginHero";
import ThemeToggle from "./ThemeToggle";
import { MagneticButton } from "./effects/MagneticButton";
import { useRippleRoot } from "./effects/Ripple";

interface PortalProps {
  onLogin: (identifier: string, password: string) => Promise<void>;
  onRegister: () => void;
  initialUsername?: string;
  registrationComplete?: boolean;
  /** 首次进入时全屏入场遮罩覆盖期间为 true：logo 静态呈现，遮罩结束后不再补播动画。 */
  introLocked?: boolean;
}

export default function Portal({
  onLogin,
  onRegister,
  initialUsername = "",
  registrationComplete = false,
  introLocked = false,
}: PortalProps) {
  /* 锁定挂载瞬间的值：遮罩结束后 introLocked 翻 false 时不能让 logo 突然补播动画。 */
  const [markLocked] = useState(introLocked);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const rippleRootRef = useRef<HTMLElement | null>(null);
  useRippleRoot(rippleRootRef);

  /* 登录失败抖动:state 控制类名,500ms 后移除,连续失败也能重播 */
  const shakeFields = () => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 500);
  };

  /* 退出登录后回到登录页时，清空上一轮留下的密码（同一个标签页内组件可能被复用）。
     配合表单上的 autoComplete="off" / "new-password"，
     避免浏览器把上次的账号密码自动填回登录框。 */
  useEffect(() => {
    setPassword("");
    setPasswordVisible(false);
    setError("");
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("请输入学号或用户名，并填写密码。");
      shakeFields();
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请检查输入后重试。");
      shakeFields();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main ref={rippleRootRef} className="lm-login-page" id="main-content">
      <DotField />
      <img className="lm-login-art" src="/art/auth-tree.png" alt="" aria-hidden="true" />
      <div className="lm-login-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="lm-login-layout">
        <LoginHero introLocked={markLocked} />
        <section className="lm-login-panel" aria-labelledby="login-title">
          <h2 id="login-title">登录学习工作台</h2>
          <p className="lm-login-panel__intro">学生可自助注册；教师和管理员账号由平台统一分配。</p>

          {registrationComplete && (
            <p className="lm-login-success" role="status">
              注册成功，请使用新账号登录。密码字段已保持为空。
            </p>
          )}

          <form className="lm-login-form" onSubmit={handleLogin} noValidate autoComplete="off">
            <div className={shaking ? "lm-form-field lm-shake-x" : "lm-form-field"}>
              <label htmlFor="student-identifier">学号或用户名</label>
              <input
                id="student-identifier"
                name="student-identifier"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
                aria-invalid={Boolean(error) && !username.trim()}
                aria-describedby={error ? "login-error" : undefined}
                placeholder="请输入学号或用户名"
              />
            </div>

            <div className={shaking ? "lm-form-field lm-shake-x" : "lm-form-field"}>
              <label htmlFor="student-password">密码</label>
              <div className="lm-password-field">
                <input
                  id="student-password"
                  name="student-password"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={submitting}
                  aria-invalid={Boolean(error) && !password}
                  aria-describedby={error ? "login-error" : "password-help"}
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
              <p className="lm-login-help" id="password-help">
                暂不支持自助找回，请联系管理员。
              </p>
            </div>

            {error && (
              <p className="lm-login-error" id="login-error" role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            <MagneticButton
              type="submit"
              className="lm-button lm-button--primary lm-login-submit"
              disabled={submitting}
              ariaBusy={submitting}
              depth={1}
              ripple
            >
              <span>{submitting ? "正在登录" : "登录"}</span>
              {!submitting && <ArrowRight aria-hidden="true" />}
            </MagneticButton>

            <button type="button" className="lm-auth-link" onClick={onRegister} disabled={submitting}>
              还没有账号？创建学生账号
            </button>
          </form>
        </section>
      </div>

      <footer className="lm-login-footer">寻笺学生学习工作台</footer>
    </main>
  );
}
