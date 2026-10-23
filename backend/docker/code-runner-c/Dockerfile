# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev python3 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 runner \
  && useradd --uid 10001 --gid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin --no-create-home runner \
  && mkdir -p /runner /work \
  && chown -R runner:runner /runner /work

COPY runner.py /runner/runner.py
RUN chmod 0555 /runner/runner.py

USER 10001:10001
WORKDIR /runner
ENTRYPOINT ["python3", "/runner/runner.py"]
