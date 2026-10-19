#!/usr/bin/env python3
# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
import json
import os
import resource
import signal
import shutil
import subprocess
import sys
import tempfile
import time

PROTOCOL_VERSION = "code-runner-c.v1"
WORK_ROOT = "/work"
MAX_MESSAGE_BYTES = 4096


def main():
    workdir = None
    try:
        task = read_task()
        validate_task(task)
        limits = normalize_limits(task.get("limits") or {})
        if len(task["sourceCode"].encode("utf-8")) > limits["maxSourceBytes"]:
            raise RunnerError("source code too large")
        tests = normalize_tests(task.get("tests") or [], limits)
        workdir = tempfile.mkdtemp(prefix="case-", dir=WORK_ROOT)
        source_path = os.path.join(workdir, "main.c")
        binary_path = os.path.join(workdir, "program")

        with open(source_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(task["sourceCode"])

        compile_result = compile_source(source_path, binary_path, workdir, limits)
        if compile_result["status"] != "success":
            emit({
                "protocolVersion": PROTOCOL_VERSION,
                "compile": compile_result,
                "execution": {
                    "status": "compile_error",
                    "passedCount": 0,
                    "totalCount": len(tests),
                    "cases": []
                }
            })
            return

        cases = []
        passed = 0
        overall = "accepted"
        for index, test in enumerate(tests, start=1):
            case = run_case(binary_path, workdir, test, index, limits)
            cases.append(case)
            if case["status"] == "accepted":
                passed += 1
            else:
                overall = case["status"]
                break

        emit({
            "protocolVersion": PROTOCOL_VERSION,
            "compile": compile_result,
            "execution": {
                "status": overall,
                "passedCount": passed,
                "totalCount": len(tests),
                "cases": cases
            }
        })
    except RunnerError as error:
        emit(build_internal_error(str(error)))
        sys.exit(0)
    except Exception:
        emit(build_internal_error("runner internal error"))
        sys.exit(0)
    finally:
        if workdir:
            shutil.rmtree(workdir, ignore_errors=True)


def read_task():
    raw = sys.stdin.buffer.read(256 * 1024 + 1)
    if len(raw) > 256 * 1024:
        raise RunnerError("task too large")
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        raise RunnerError("invalid task json")


def validate_task(task):
    if not isinstance(task, dict):
        raise RunnerError("task must be an object")
    allowed = {"protocolVersion", "language", "sourceCode", "tests", "limits"}
    if set(task.keys()) - allowed:
        raise RunnerError("task contains unsupported fields")
    if task.get("protocolVersion") != PROTOCOL_VERSION:
        raise RunnerError("unsupported protocol version")
    if task.get("language") != "c":
        raise RunnerError("unsupported language")
    if not isinstance(task.get("sourceCode"), str) or not task["sourceCode"].strip():
        raise RunnerError("source code is required")
    if not isinstance(task.get("tests"), list):
        raise RunnerError("tests must be an array")
    if not isinstance(task.get("limits"), dict):
        raise RunnerError("limits must be an object")


def normalize_limits(raw):
    return {
        "maxSourceBytes": int(raw.get("maxSourceBytes", 65536)),
        "maxInputBytes": int(raw.get("maxInputBytes", 32768)),
        "maxOutputBytes": int(raw.get("maxOutputBytes", 65536)),
        "maxTests": int(raw.get("maxTests", 20)),
        "compileTimeoutMs": int(raw.get("compileTimeoutMs", 5000)),
        "caseTimeoutMs": int(raw.get("caseTimeoutMs", 2000)),
    }


def normalize_tests(raw_tests, limits):
    if len(raw_tests) < 1 or len(raw_tests) > limits["maxTests"]:
        raise RunnerError("invalid test count")
    tests = []
    for index, item in enumerate(raw_tests, start=1):
        if not isinstance(item, dict):
            raise RunnerError("test must be an object")
        allowed = {"id", "visibility", "input", "expectedOutput", "compareOutput"}
        if set(item.keys()) - allowed:
            raise RunnerError("test contains unsupported fields")
        visibility = item.get("visibility")
        if visibility not in ("public", "hidden"):
            raise RunnerError("invalid test visibility")
        input_text = item.get("input", "")
        expected = item.get("expectedOutput", "")
        if not isinstance(input_text, str) or not isinstance(expected, str):
            raise RunnerError("test input and expected output must be strings")
        if len(input_text.encode("utf-8")) > limits["maxInputBytes"]:
            raise RunnerError("test input too large")
        safe_id = str(item.get("id") or f"case-{index}")[:80]
        tests.append({
            "id": safe_id,
            "visibility": visibility,
            "input": input_text,
            "expectedOutput": expected,
            "compareOutput": visibility == "hidden" or item.get("compareOutput", True) is not False
        })
    return tests


def compile_source(source_path, binary_path, workdir, limits):
    args = [
        "gcc",
        "-std=c11",
        "-O2",
        "-Wall",
        "-Wextra",
        source_path,
        "-o",
        binary_path,
        "-lm"
    ]
    started = time.monotonic()
    try:
        completed = subprocess.run(
            args,
            cwd=workdir,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=limits["compileTimeoutMs"] / 1000,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"status": "compile_error", "message": "compile timeout", "durationMs": limits["compileTimeoutMs"]}

    message = sanitize_message(completed.stderr.decode("utf-8", "replace") or completed.stdout.decode("utf-8", "replace"))
    return {
        "status": "success" if completed.returncode == 0 else "compile_error",
        "message": "" if completed.returncode == 0 else message,
        "durationMs": int((time.monotonic() - started) * 1000)
    }


def run_case(binary_path, workdir, test, index, limits):
    started = time.monotonic()
    def limit_child():
        resource.setrlimit(resource.RLIMIT_FSIZE, (limits["maxOutputBytes"], limits["maxOutputBytes"]))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    status = None
    message = ""
    try:
        # Bounded files avoid buffering an infinite printf loop in judge memory.
        # Open before spawning, then unlink so student code cannot locate them.
        with tempfile.TemporaryFile(dir=workdir) as input_file, tempfile.TemporaryFile(dir=workdir) as output_file, tempfile.TemporaryFile(dir=workdir) as error_file:
            input_file.write(test["input"].encode("utf-8"))
            input_file.seek(0)
            proc = subprocess.Popen(
                [binary_path], cwd=workdir, stdin=input_file,
                stdout=output_file, stderr=error_file,
                start_new_session=True, preexec_fn=limit_child,
            )
            try:
                proc.wait(timeout=limits["caseTimeoutMs"] / 1000)
            except subprocess.TimeoutExpired:
                status, message = "timeout", "time limit exceeded"
            finally:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait(timeout=1)
            output_file.seek(0)
            error_file.seek(0)
            stdout = output_file.read(limits["maxOutputBytes"])
            stderr = error_file.read(limits["maxOutputBytes"])
    except Exception:
        return safe_case(test, index, "runtime_error", "program could not start", started, limits)

    if len(stdout) >= limits["maxOutputBytes"] or len(stderr) >= limits["maxOutputBytes"] or proc.returncode == -signal.SIGXFSZ:
        status, message = "output_limit", "output limit exceeded"
    elif not status and proc.returncode != 0:
        status, message = "runtime_error", f"program exited with code {proc.returncode}"

    actual = stdout.decode("utf-8", "replace")
    expected = test["expectedOutput"]
    if not status:
        status = "accepted" if not test["compareOutput"] or normalize_output(actual) == normalize_output(expected) else "wrong_answer"
        message = "" if status == "accepted" else "output did not match expected result"
    case = safe_case(test, index, status, message, started, limits)
    if test["visibility"] == "public":
        case["stdout"] = truncate_text(actual, 4096)
        case["stderr"] = truncate_text(stderr.decode("utf-8", "replace"), 2048)
    return case


def safe_case(test, index, status, message, started, limits):
    return {
        "id": str(test.get("id") or f"case-{index}")[:80],
        "visibility": test["visibility"],
        "status": status,
        "message": truncate_text(message or status, 240),
        "durationMs": min(int((time.monotonic() - started) * 1000), limits["caseTimeoutMs"] + 1000),
    }


def normalize_output(value):
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip(" \t") for line in text.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def sanitize_message(value):
    text = str(value or "")
    for token in ("/work/", "/tmp/", "/runner/"):
        text = text.replace(token, "")
    return truncate_text(text, MAX_MESSAGE_BYTES)


def truncate_text(value, limit):
    text = str(value or "")
    if len(text.encode("utf-8")) <= limit:
        return text
    encoded = text.encode("utf-8")[:limit]
    return encoded.decode("utf-8", "ignore") + "...truncated"


def build_internal_error(message):
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "compile": {"status": "internal_error", "message": truncate_text(message, 240)},
        "execution": {
            "status": "internal_error",
            "passedCount": 0,
            "totalCount": 0,
            "cases": []
        }
    }


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


class RunnerError(Exception):
    pass


if __name__ == "__main__":
    main()
