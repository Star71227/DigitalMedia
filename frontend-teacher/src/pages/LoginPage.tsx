/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { navigate } from "../router";
import DotField from "../components/DotField";
import LoginHero from "../components/LoginHero";
import { ThemeToggle } from "../components/ThemeToggle";
import { MagneticButton } from "../components/effects/MagneticButton";
import { useRippleRoot } from "../components/effects/Ripple";

export function LoginPage({
  introLocked = false,
  onLoginSuccess,
}: {
  introLocked?: boolean;
  onLoginSuccess?: () => void;
}) {
  const { signIn } = useAuth();
  /* 锁定挂载瞬间的值：遮罩结束后 introLocked 翻 false 时不能让 logo 突然补播动画。 */
  const [markLocked] = useState(introLocked);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [shaking, setShaking] = useState(false);
  const rippleRootRef = useRef<HTMLElement | null>(null);
  useRippleRoot(rippleRootRef);

  /* 登录失败抖动:remove→强制回流→双 rAF→add,保证连续失败也重播 */
  const shakeFields = () => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 500);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signIn(identifier, password);
      navigate("/dashboard", true);
      onLoginSuccess?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "登录失败");
      shakeFields();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const flash = window.sessionStorage.getItem("learnmate_teacher_flash");
    if (flash) {
      setNotice(flash);
      window.sessionStorage.removeItem("learnmate_teacher_flash");
    }
    /* 退出登录后回到登录页时，清空上一轮留下的密码（同一标签页内组件可能被复用）。
       配合表单上的 autoComplete="off" / "new-password"，
       避免浏览器把上次的账号密码自动填回登录框。 */
    setPassword("");
    setPasswordVisible(false);
    setError("");
  }, []);

  return (
    <main ref={rippleRootRef} className="lm-login-page" id="main-content">
      <DotField />
      <div className="lm-login-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="lm-login-layout">
        <LoginHero introLocked={markLocked} />
        <section className="lm-login-panel" aria-labelledby="teacher-login-title">
          <h2 id="teacher-login-title">登录教师工作台</h2>
          <p className="lm-login-panel__intro">
            教师账号可自助注册；学生账号由平台统一分配，登录后仅能访问学生端。
          </p>

          {notice && (
            <p className="lm-login-success" role="status">
              {notice}
            </p>
          )}

          <form className="lm-login-form" onSubmit={submit} noValidate autoComplete="off">
            <div className={shaking ? "lm-form-field lm-shake-x" : "lm-form-field"}>
              <label htmlFor="teacher-identifier">用户名或编号</label>
              <input
                id="teacher-identifier"
                name="teacher-identifier"
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
                aria-invalid={Boolean(error) && !identifier.trim()}
                aria-describedby={error ? "teacher-login-error" : undefined}
                placeholder="请输入用户名或教师编号"
                required
                maxLength={100}
              />
            </div>

            <div className={shaking ? "lm-form-field lm-shake-x" : "lm-form-field"}>
              <label htmlFor="teacher-password">密码</label>
              <div className="lm-password-field">
                <input
                  id="teacher-password"
                  name="teacher-password"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                  aria-invalid={Boolean(error) && !password}
                  aria-describedby={error ? "teacher-login-error" : "teacher-password-help"}
                  required
                  maxLength={200}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                  aria-pressed={passwordVisible}
                  disabled={loading}
                >
                  {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              <p className="lm-login-help" id="teacher-password-help">
                暂不支持自助找回，请联系管理员。
              </p>
            </div>

            {error && (
              <p className="lm-login-error" id="teacher-login-error" role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            <MagneticButton
              type="submit"
              className="lm-login-submit"
              disabled={loading}
              ariaBusy={loading}
              depth={1}
              ripple
            >
              <span>{loading ? "正在验证" : "登录"}</span>
              {!loading && <ArrowRight aria-hidden="true" />}
            </MagneticButton>

            <button
              type="button"
              className="lm-auth-link"
              onClick={() => navigate("/register")}
              disabled={loading}
            >
              没有教师账号？创建教师账号
            </button>
          </form>
        </section>
      </div>

      <footer className="lm-login-footer">智课研伴教师工作台</footer>
    </main>
  );
}
