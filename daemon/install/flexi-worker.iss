; Inno Setup script for the flexi-worker daemon (Windows setup.exe).
; Installs the binary per-user (no admin), optionally configures it with the
; access key entered during setup, and registers a hidden login task.
; Compiled in CI:  ISCC.exe install\flexi-worker.iss  ->  Output\flexi-worker-setup.exe

#define AppName "flexi-worker"
#define AppExe "flexi-worker.exe"

[Setup]
AppName={#AppName}
AppVersion=0.1.0
AppPublisher=flexi-worker
DefaultDirName={localappdata}\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=flexi-worker-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
Uninstallable=yes

[Files]
Source: "..\target\release\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  KeyPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  KeyPage := CreateInputQueryPage(wpWelcome,
    'Authorize this machine',
    'Paste the access key from the web app (Machines > Add machine).',
    'You can leave this blank and run "flexi-worker configure" from a terminal later.');
  KeyPage.Add('Access key:', False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Exe, Vbs, Key: String;
  Rc: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    Exe := ExpandConstant('{app}\{#AppExe}');

    { A launcher that starts the console daemon with no visible window. }
    Vbs := ExpandConstant('{app}\launch.vbs');
    SaveStringToFile(Vbs,
      'CreateObject("WScript.Shell").Run """' + Exe + '""", 0, False' + #13#10, False);

    { Optionally configure with the key the user pasted. }
    Key := Trim(KeyPage.Values[0]);
    if Key <> '' then
      Exec(Exe, 'configure --key ' + Key, '', SW_HIDE, ewWaitUntilTerminated, Rc);

    { Auto-start at login (per-user, hidden). }
    Exec(ExpandConstant('{sys}\schtasks.exe'),
      '/Create /TN flexi-worker /SC ONLOGON /RL LIMITED /TR "wscript.exe ""' + Vbs + '""" /F',
      '', SW_HIDE, ewWaitUntilTerminated, Rc);
  end;
end;

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN flexi-worker /F"; Flags: runhidden; RunOnceId: "DelFlexiTask"

[UninstallDelete]
Type: files; Name: "{app}\launch.vbs"
