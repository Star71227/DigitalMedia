LearnMate Windows one-click package
===================================

1. Install Docker Desktop for Windows (Linux containers mode) and start it once.
2. Double-click LearnMate-Rescue.exe.
3. The launcher creates local secrets, builds the four containers, waits for the
   backend health check, and opens the student page.

URLs after startup:
  Student: http://localhost:8080
  Teacher: http://localhost:8081

Local demo accounts (created on first startup):
  Student: zhangsan or lisi
  Teacher: teacher_demo
  Password: 使用本机配置的数据库密码；请检查本机 .env，勿提交或共享密码。

To stop the services, run
%LOCALAPPDATA%\LearnMate-Rescue\stop-learnmate.ps1. Docker volumes are
preserved, so later starts keep your data.

This package is intended for local/demo use. It binds services to 127.0.0.1.
The project uses Docker Desktop; the executable is a one-click launcher rather
than a replacement for Docker itself.
