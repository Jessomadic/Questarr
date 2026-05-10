#define MyAppName "Questarr"
#define MyAppPublisher "Questarr"
#define MyAppVersion GetEnv("QUESTARR_VERSION")
#define MySourceDir GetEnv("QUESTARR_SOURCE_DIR")
#define MyOutputDir GetEnv("QUESTARR_OUTPUT_DIR")

#if MyAppVersion == ""
  #define MyAppVersion "0.0.0"
#endif

[Setup]
AppId={{D31E56AC-4537-4B4E-9D82-9017D33BC0F1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Questarr
DefaultGroupName=Questarr
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename=QuestarrSetup-{#MyAppVersion}-windows-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\Questarr.Service.exe
CloseApplications=no

[Dirs]
Name: "{commonappdata}\Questarr"
Name: "{commonappdata}\Questarr\data"
Name: "{commonappdata}\Questarr\logs"

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Questarr"; Filename: "http://localhost:5000"
Name: "{group}\Questarr Logs"; Filename: "{commonappdata}\Questarr\logs"
Name: "{group}\Uninstall Questarr"; Filename: "{uninstallexe}"

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Questarr"""; Flags: runhidden waituntilterminated; StatusMsg: "Refreshing Windows Firewall rule..."
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Questarr"" dir=in action=allow program=""{app}\bin\node.exe"" enable=yes"; Flags: runhidden waituntilterminated; StatusMsg: "Adding Windows Firewall rule..."
Filename: "{sys}\sc.exe"; Parameters: "create Questarr binPath= ""{app}\Questarr.Service.exe"" start= auto DisplayName= ""Questarr"""; Flags: runhidden waituntilterminated; StatusMsg: "Installing Questarr service..."
Filename: "{sys}\sc.exe"; Parameters: "description Questarr ""Questarr video game management service"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure Questarr reset= 86400 actions= restart/60000/restart/60000/""""/60000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start Questarr"; Flags: runhidden waituntilterminated; StatusMsg: "Starting Questarr service..."

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop Questarr"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "delete Questarr"; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Questarr"""; Flags: runhidden waituntilterminated

[Code]
function PowerShellSingleQuote(Value: String): String;
var
  Escaped: String;
begin
  Escaped := Value;
  StringChangeEx(Escaped, '''', '''''', True);
  Result := '''' + Escaped + '''';
end;

function StopInstalledQuestarr(Context: String): String;
var
  ScriptPath: String;
  Script: String;
  ResultCode: Integer;
  InstallDir: String;
begin
  Result := '';
  InstallDir := ExpandConstant('{app}');
  ScriptPath := ExpandConstant('{tmp}\questarr-stop-' + Context + '.ps1');
  Script :=
    '$ErrorActionPreference = ''Continue''' + #13#10 +
    '$serviceName = ''Questarr''' + #13#10 +
    '$installDir = [System.IO.Path]::GetFullPath(' + PowerShellSingleQuote(InstallDir) + ')' + #13#10 +
    'if (-not $installDir.EndsWith([string][System.IO.Path]::DirectorySeparatorChar)) { $installDir += [System.IO.Path]::DirectorySeparatorChar }' + #13#10 +
    '$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue' + #13#10 +
    'if ($service) {' + #13#10 +
    '  if ($service.Status -ne ''Stopped'') {' + #13#10 +
    '    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue' + #13#10 +
    '    try { $service.WaitForStatus(''Stopped'', ''00:00:30'') } catch { }' + #13#10 +
    '  }' + #13#10 +
    '  & sc.exe delete $serviceName | Out-Null' + #13#10 +
    '}' + #13#10 +
    'Start-Sleep -Seconds 1' + #13#10 +
    'Get-CimInstance Win32_Process | ForEach-Object {' + #13#10 +
    '  if ($_.ExecutablePath) {' + #13#10 +
    '    try { $exe = [System.IO.Path]::GetFullPath($_.ExecutablePath) } catch { $exe = $null }' + #13#10 +
    '    if ($exe -and $exe.StartsWith($installDir, [System.StringComparison]::OrdinalIgnoreCase)) {' + #13#10 +
    '      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue' + #13#10 +
    '    }' + #13#10 +
    '  }' + #13#10 +
    '}' + #13#10 +
    'Start-Sleep -Seconds 1' + #13#10 +
    'exit 0' + #13#10;

  Log('Preparing Questarr ' + Context + ' by stopping the service and install-directory processes.');
  if not SaveStringToFile(ScriptPath, Script, False) then
  begin
    Result := 'Questarr could not prepare the service shutdown script.';
    Exit;
  end;

  if not Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File ' + AddQuotes(ScriptPath),
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    Result := 'Questarr could not run the service shutdown script.';
    Exit;
  end;

  if ResultCode <> 0 then
  begin
    Result := 'Questarr could not stop the existing service. Close Questarr processes and retry setup.';
    Exit;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := StopInstalledQuestarr('upgrade');
end;

function InitializeUninstall(): Boolean;
var
  StopError: String;
begin
  StopError := StopInstalledQuestarr('uninstall');
  if StopError <> '' then
  begin
    Result := MsgBox(StopError + #13#10#13#10 + 'Continue uninstall anyway?', mbConfirmation, MB_YESNO) = IDYES;
  end
  else
  begin
    Result := True;
  end;
end;
