# LearnMate C Code Runner

This image is the restricted local CodeLab runner for LearnMate 2.4A.

It reads one JSON task from stdin, compiles C11 source with fixed gcc flags, runs the supplied tests inside the container tmpfs, and writes one JSON result to stdout.

The backend must run it with Docker restrictions: no network, read-only root filesystem, no host mounts, non-root user, dropped capabilities, no-new-privileges, memory/CPU/PID/output/time limits. Only `/work` is an executable tmpfs for the compiled binary; `/tmp` remains noexec.

Build:

```sh
npm run code-runner:build
```

Verify:

```sh
npm run code-runner:verify
```
