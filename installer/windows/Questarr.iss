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
Filename: "{cmd}"; Parameters: "/c sc.exe stop Questarr 2>nul & sc.exe delete Questarr 2>nul"; Flags: runhidden waituntilterminated; StatusMsg: "Removing previous Questarr service..."
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
