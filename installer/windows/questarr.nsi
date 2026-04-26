; Questarr Windows Installer
; Built with NSIS 3.x (Nullsoft Scriptable Install System)
;
; Defines passed by the build workflow via /D flags:
;   VERSION       — app version string, e.g. 1.3.0
;   APP_DIR       — absolute path to staged app/ directory
;   NODE_DIR      — absolute path to staged Node.js runtime directory
;   NSSM_EXE      — absolute path to nssm.exe
;   LICENSE_FILE  — absolute path to the COPYING (GPL-3) file

!define APP_NAME       "Questarr"
!define SERVICE_NAME   "Questarr"
!define PUBLISHER      "Doezer"
!define URL_INFO       "https://github.com/Doezer/Questarr"
!define DEFAULT_PORT   "5000"
!define DATA_SUBDIR    "Questarr"
!define REG_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define REG_APP_KEY    "Software\${APP_NAME}"

; ── Modern UI 2 ───────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name    "${APP_NAME} ${VERSION}"
OutFile "questarr-${VERSION}-windows-x64-setup.exe"
InstallDir          "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey    HKLM "${REG_APP_KEY}" "InstallDir"
RequestExecutionLevel admin
Unicode True
SetCompressor       /SOLID lzma

; ── UI config ─────────────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APP_NAME} ${VERSION} Setup"
!define MUI_WELCOMEPAGE_TEXT  "This wizard will install ${APP_NAME} on your computer.$\r$\n$\r$\nQuestarr is a video game management application inspired by the *Arr ecosystem (Sonarr, Radarr). It runs as a Windows service and is accessible from your web browser.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT   "Open ${APP_NAME} in browser"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenBrowser
!define MUI_UNFINISHPAGE_NOAUTOCLOSE

; ── Installer pages ───────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
Page custom PortPage PortPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; ── Uninstaller pages ─────────────────────────────────────────────────────────
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPage un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; ── Runtime variables ─────────────────────────────────────────────────────────
Var PortValue
Var PortInput
Var PortDialog
Var DataDir
Var DeleteData
Var DeleteDataCheckbox

; ── Helper: build the ProgramData path ───────────────────────────────────────
; $APPDATA resolves to the current user's Roaming folder; ProgramData is one
; level above its parent.  We read it from the registry to be accurate.
Function GetProgramData
  ReadRegStr $DataDir HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" "Common AppData"
  ${If} $DataDir == ""
    StrCpy $DataDir "C:\ProgramData"
  ${EndIf}
  StrCpy $DataDir "$DataDir\${DATA_SUBDIR}"
FunctionEnd

Function un.GetProgramData
  ReadRegStr $DataDir HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" "Common AppData"
  ${If} $DataDir == ""
    StrCpy $DataDir "C:\ProgramData"
  ${EndIf}
  StrCpy $DataDir "$DataDir\${DATA_SUBDIR}"
FunctionEnd

; ── Port selection custom page ────────────────────────────────────────────────
Function PortPage
  ${If} $PortValue == ""
    StrCpy $PortValue "${DEFAULT_PORT}"
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Service Port" "Choose the TCP port ${APP_NAME} will listen on."

  nsDialogs::Create 1018
  Pop $PortDialog
  ${If} $PortDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 16u 100% 12u "Port number (default: ${DEFAULT_PORT}):"
  Pop $0

  ${NSD_CreateNumber} 0 32u 60u 14u "$PortValue"
  Pop $PortInput

  ${NSD_CreateLabel} 0 56u 100% 32u "After installation, open your browser to:$\r$\n    http://localhost:$PortValue$\r$\n$\r$\nEnsure this port is free before proceeding."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function PortPageLeave
  ${NSD_GetText} $PortInput $PortValue
  ${If} $PortValue == ""
    StrCpy $PortValue "${DEFAULT_PORT}"
  ${EndIf}
FunctionEnd

; ── Finish page: open browser ─────────────────────────────────────────────────
Function OpenBrowser
  ExecShell "open" "http://localhost:$PortValue"
FunctionEnd

; ── Uninstaller data page ─────────────────────────────────────────────────────
Function un.DataPage
  Call un.GetProgramData

  !insertmacro MUI_HEADER_TEXT "Application Data" "Choose whether to keep your Questarr data."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 28u "Your database and logs are stored in:$\r$\n$DataDir$\r$\n$\r$\nBy default they are kept so you can reinstall without losing your library."
  Pop $0

  ${NSD_CreateCheckbox} 0 48u 100% 12u "Permanently delete application data (database, logs)"
  Pop $DeleteDataCheckbox
  ${NSD_SetState} $DeleteDataCheckbox ${BST_UNCHECKED}

  nsDialogs::Show
FunctionEnd

Function un.DataPageLeave
  ${NSD_GetState} $DeleteDataCheckbox $DeleteData
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; INSTALL SECTION
; ═════════════════════════════════════════════════════════════════════════════
Section "${APP_NAME}" SecMain
  SectionIn RO

  Call GetProgramData

  ; ── Stop and remove existing service (upgrade path) ───────────────────────
  ; sc query returns 0 when the service exists, non-zero otherwise.
  ; We use sc.exe here (not nssm) because nssm.exe has not been installed yet —
  ; it is copied in the next block.  sc stop + sc delete is sufficient to clean
  ; up an NSSM-managed service; NSSM stores no separate state outside the SCM.
  ClearErrors
  nsExec::ExecToLog 'sc query "${SERVICE_NAME}"'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Stopping existing ${APP_NAME} service for upgrade..."
    nsExec::ExecToLog 'sc stop "${SERVICE_NAME}"'
    Pop $0
    Sleep 4000
    nsExec::ExecToLog 'sc delete "${SERVICE_NAME}"'
    Pop $0
    Sleep 1000
  ${EndIf}

  ; ── Copy application files ─────────────────────────────────────────────────
  SetOutPath "$INSTDIR\app"
  DetailPrint "Installing ${APP_NAME} application files..."
  File /r "${APP_DIR}\*"

  ; ── Copy Node.js runtime ──────────────────────────────────────────────────
  SetOutPath "$INSTDIR\node"
  DetailPrint "Installing Node.js runtime..."
  File /r "${NODE_DIR}\*"

  ; ── Copy NSSM ─────────────────────────────────────────────────────────────
  SetOutPath "$INSTDIR"
  File "${NSSM_EXE}"

  ; ── Create ProgramData directory for the database and logs ────────────────
  CreateDirectory "$DataDir"
  ; Grant the local Users group read/write access so the service account can
  ; write the SQLite database and log files without running as SYSTEM/admin.
  nsExec::ExecToLog 'icacls "$DataDir" /grant "Users:(OI)(CI)F" /T /Q'
  Pop $0

  ; ── Register the Windows service via NSSM ─────────────────────────────────
  DetailPrint "Installing ${APP_NAME} Windows service..."

  ; Create the service pointing at the bundled node.exe
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" install "${SERVICE_NAME}" "$INSTDIR\node\node.exe"'
  Pop $0

  ; Working directory = app root so process.cwd()/migrations resolves correctly
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppDirectory "$INSTDIR\app"'
  Pop $0

  ; Entry point is the esbuild-bundled server module
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppParameters "dist\server\index.mjs"'
  Pop $0

  ; Environment — mirrors the Docker defaults from the Dockerfile / docker-compose.yml
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppEnvironmentExtra "NODE_ENV=production" "SQLITE_DB_PATH=$DataDir\sqlite.db" "PORT=$PortValue" "HOST=0.0.0.0"'
  Pop $0

  ; Auto-start with Windows
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" Start SERVICE_AUTO_START'
  Pop $0

  ; Human-readable name shown in services.msc
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" DisplayName "${APP_NAME}"'
  Pop $0

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" Description "Video game management app — open http://localhost:$PortValue in your browser."'
  Pop $0

  ; Redirect stdout/stderr to rolling log files in ProgramData
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppStdout "$DataDir\questarr.log"'
  Pop $0

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppStderr "$DataDir\questarr-error.log"'
  Pop $0

  ; Rotate logs at 10 MB
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppRotateFiles 1'
  Pop $0

  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppRotateBytes 10485760'
  Pop $0

  ; Restart the process automatically 5 s after an unexpected exit
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" set "${SERVICE_NAME}" AppRestartDelay 5000'
  Pop $0

  ; ── Start the service (runs migrations on first boot) ──────────────────────
  ; Questarr's ensureDatabase() runs all pending Drizzle migrations automatically
  ; on every startup, so the database is initialised here.
  DetailPrint "Starting ${APP_NAME} service (runs database migrations on first start)..."
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" start "${SERVICE_NAME}"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "${APP_NAME} was installed but the service could not start automatically.$\r$\n$\r$\nStart it from the Windows Services console (services.msc) or run:$\r$\n  $INSTDIR\nssm.exe start ${SERVICE_NAME}"
  ${EndIf}

  ; ── Persist install configuration to registry ──────────────────────────────
  WriteRegStr  HKLM "${REG_APP_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr  HKLM "${REG_APP_KEY}" "Version"    "${VERSION}"
  WriteRegStr  HKLM "${REG_APP_KEY}" "Port"        "$PortValue"
  WriteRegStr  HKLM "${REG_APP_KEY}" "DataDir"     "$DataDir"

  ; ── Add/Remove Programs entry ─────────────────────────────────────────────
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "DisplayName"          "${APP_NAME}"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "DisplayVersion"       "${VERSION}"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "Publisher"            "${PUBLISHER}"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "URLInfoAbout"         "${URL_INFO}"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "UninstallString"      '"$INSTDIR\uninstall.exe"'
  WriteRegStr  HKLM "${REG_UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${REG_UNINST_KEY}" "NoModify"            1
  WriteRegDWORD HKLM "${REG_UNINST_KEY}" "NoRepair"            1

  ; Estimate installed size (KB) for Add/Remove Programs display
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${REG_UNINST_KEY}" "EstimatedSize" "$0"

  ; ── Start Menu shortcuts ───────────────────────────────────────────────────
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"

  ; URL shortcut — opens the app in the default browser
  WriteINIStr "$SMPROGRAMS\${APP_NAME}\Open ${APP_NAME}.url" "InternetShortcut" "URL" "http://localhost:$PortValue"

  ; Shortcut to the uninstaller
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"

SectionEnd

; ═════════════════════════════════════════════════════════════════════════════
; UNINSTALL SECTION
; ═════════════════════════════════════════════════════════════════════════════
Section "Uninstall"

  Call un.GetProgramData

  ; ── Stop and remove the Windows service ───────────────────────────────────
  DetailPrint "Stopping ${APP_NAME} service..."
  nsExec::ExecToLog 'sc stop "${SERVICE_NAME}"'
  Pop $0
  Sleep 3000

  DetailPrint "Removing ${APP_NAME} service..."
  nsExec::ExecToLog '"$INSTDIR\nssm.exe" remove "${SERVICE_NAME}" confirm'
  Pop $0
  Sleep 1000

  ; ── Remove application files ──────────────────────────────────────────────
  DetailPrint "Removing application files..."
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete    "$INSTDIR\nssm.exe"
  Delete    "$INSTDIR\uninstall.exe"
  RMDir     "$INSTDIR"

  ; ── Remove Start Menu shortcuts ───────────────────────────────────────────
  Delete "$SMPROGRAMS\${APP_NAME}\Open ${APP_NAME}.url"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; ── Optionally delete the data directory ─────────────────────────────────
  ${If} $DeleteData == ${BST_CHECKED}
    DetailPrint "Removing application data from $DataDir..."
    RMDir /r "$DataDir"
  ${Else}
    DetailPrint "Keeping application data at $DataDir"
  ${EndIf}

  ; ── Remove registry keys ──────────────────────────────────────────────────
  DeleteRegKey HKLM "${REG_UNINST_KEY}"
  DeleteRegKey HKLM "${REG_APP_KEY}"

SectionEnd
