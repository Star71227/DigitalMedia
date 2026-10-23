; 寻笺 LearnMate 桌面版 — Inno Setup 安装脚本
; 由 packaging\desktop\build-desktop-installer.ps1 调用 ISCC 编译（会以 UTF-8 BOM 写入临时副本）。
; 需要的宏：AppVersion / PayloadDir / OutputDir / OutputBase / IconFile（LangFile 可选）

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef PayloadDir
  #define PayloadDir "..\payload"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif
#ifndef OutputBase
  #define OutputBase "LearnMate-Setup-" + AppVersion
#endif

#define AppName "寻笺 LearnMate"
#define AppShortName "寻笺"
#define AppPublisher "LearnMate"
#define AppExeName "LearnMate.exe"

[Setup]
AppId={{8E4C1D74-5A2B-4C9F-9E31-7B62A0D45F18}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\LearnMate
DefaultGroupName={#AppShortName}
DisableProgramGroupPage=yes
DisableReadyPage=no
AllowNoIcons=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBase}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
RestartApplications=no
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\LearnMate.ico
SetupIconFile={#IconFile}
#ifdef WizardSmall
WizardSmallImageFile={#WizardSmall}
#endif
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} 桌面版安装程序
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

#ifdef LangFile
[Languages]
Name: "chinesesimplified"; MessagesFile: "{#LangFile}"
#endif

[Tasks]
Name: "desktopicon"; Description: "创建学生端桌面快捷方式(&D)"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "desktopicon_teacher"; Description: "创建教师端桌面快捷方式(&T)"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppShortName} 学生端"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Comment: "打开学生端（登录后进入学习工作台）"
Name: "{group}\{#AppShortName} 教师端"; Filename: "{app}\{#AppExeName}"; Parameters: "--teacher"; WorkingDir: "{app}"; Comment: "打开教师端（教师工作台）"
Name: "{group}\{#AppShortName} 使用说明"; Filename: "{app}\使用说明.txt"
Name: "{group}\停止{#AppShortName}（后台服务）"; Filename: "{app}\停止寻笺.bat"; WorkingDir: "{app}"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppShortName} 学生端"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autodesktop}\{#AppShortName} 教师端"; Filename: "{app}\{#AppExeName}"; Parameters: "--teacher"; WorkingDir: "{app}"; Tasks: desktopicon_teacher

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\stop-learnmate.ps1"" -Quiet"; Flags: runhidden; RunOnceId: "StopLearnMateServices"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\runtime\pids"
Type: files; Name: "{app}\runtime\config.json"
Type: files; Name: "{app}\.env"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  { 覆盖安装前先结束正在运行的桌面端与后台服务 }
  Exec('taskkill.exe', '/IM LearnMate.exe /F /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if FileExists(ExpandConstant('{app}\scripts\stop-learnmate.ps1')) then
    Exec('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\stop-learnmate.ps1') + '" -Quiet',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/IM LearnMate.exe /F /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(300);
  Result := True;
end;
