# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# CodeLab 判题（CODE_EXECUTION_MODE=docker）需要容器内能调用 docker CLI：
# 后端把任务用 stdin 喂给一次性判题容器，所以只需要命令行客户端 + 宿主 docker.sock，
# 不做任何目录绑定挂载。用官方 cli 镜像拷一个静态二进制，比装 docker.io 轻得多。
FROM docker:27-cli AS dockercli

FROM node:24.17.0-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:24.17.0-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium fonts-noto-cjk tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=5800 \
    REPORT_BROWSER_PATH=/usr/bin/chromium \
    REPORT_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    RESOURCE_STORAGE_DIR=/app/storage/resources \
    REPORT_STORAGE_DIR=/app/storage/reports

WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node data ./data
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker

RUN mkdir -p /app/storage/resources /app/storage/reports \
    && chown -R node:node /app/storage

USER node
EXPOSE 5800

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5800)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
