; Inno Setup script for Terminyxx.
; Build the app first (wails build), then from the repo root:
;   iscc /DAppVersion=0.1.1 [/DArch=arm64] build\windows\installer\terminyxx.iss
; The installer is written to build\bin\.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
; Numeric file version (no "-beta" suffix); the release workflow passes it for prerelease tags.
#ifndef AppNumVersion
  #define AppNumVersion AppVersion
#endif
; Target CPU: x64 (default) or arm64. Pass /DArch=arm64 with an arm64 build of the exe.
#ifndef Arch
  #define Arch "x64"
#endif
#if Arch == "arm64"
  #define ArchAllowed "arm64"
#elif Arch == "x64"
  #define ArchAllowed "x64compatible"
#else
  #error Arch must be x64 or arm64
#endif
#define AppName "Terminyxx"
#define AppExe "terminyxx.exe"
#define AppPublisher "Intteger157"
#define AppURL "https://github.com/Intteger157/terminyxx"
#define Root "..\..\.."
; The exe to package; override with /DSourceExe=... to package a differently named build.
#ifndef SourceExe
  #define SourceExe Root + "\build\bin\" + AppExe
#endif

[Setup]
; Keep AppId fixed forever: upgrades and uninstall find the app by it.
AppId={{4B07779B-800B-4E1B-BBFF-E2BC3C726B05}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Per-user install by default (no UAC); the user can pick "all users" in the dialog.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed={#ArchAllowed}
ArchitecturesInstallIn64BitMode={#ArchAllowed}
MinVersion=10.0
OutputDir={#Root}\build\bin
OutputBaseFilename=Terminyxx-{#AppVersion}-windows-{#Arch}-setup
SetupIconFile={#Root}\build\windows\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppNumVersion}
VersionInfoProductName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "{#AppExe}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
