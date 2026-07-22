param(
  [Parameter(Mandatory = $true)]
  [string] $ExecutablePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class LightClipShortcutProbe
{
    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maxLength);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr window, int id);

    public static IntPtr FindMainWindow(uint processId)
    {
        IntPtr result = IntPtr.Zero;
        EnumWindows((window, parameter) =>
        {
            GetWindowThreadProcessId(window, out uint ownerProcessId);
            if (ownerProcessId != processId)
            {
                return true;
            }

            StringBuilder title = new StringBuilder(256);
            GetWindowText(window, title, title.Capacity);
            if (title.ToString() == "LightClip")
            {
                result = window;
                return false;
            }

            return true;
        }, IntPtr.Zero);
        return result;
    }

    public static void SendAltV()
    {
        const byte alt = 0x12;
        const byte v = 0x56;
        const uint keyUp = 0x0002;
        keybd_event(alt, 0, 0, UIntPtr.Zero);
        keybd_event(v, 0, 0, UIntPtr.Zero);
        keybd_event(v, 0, keyUp, UIntPtr.Zero);
        keybd_event(alt, 0, keyUp, UIntPtr.Zero);
    }

    public static void SendEnter()
    {
        const byte enter = 0x0D;
        const uint keyUp = 0x0002;
        keybd_event(enter, 0, 0, UIntPtr.Zero);
        keybd_event(enter, 0, keyUp, UIntPtr.Zero);
    }

    public static bool IsAltVRegistered()
    {
        const int probeId = 0x4C43;
        const uint altNoRepeat = 0x4001;
        const uint v = 0x56;
        if (RegisterHotKey(IntPtr.Zero, probeId, altNoRepeat, v))
        {
            UnregisterHotKey(IntPtr.Zero, probeId);
            return false;
        }

        const int hotkeyAlreadyRegistered = 1409;
        return Marshal.GetLastWin32Error() == hotkeyAlreadyRegistered;
    }
}
'@

$resolvedExecutable = Resolve-Path -LiteralPath $ExecutablePath
$storeDirectory = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'LightClip'
$storeBackupDirectory = "$storeDirectory.packaged-test-$([Guid]::NewGuid().ToString('N'))"
$expectedText = "LightClip packaged paste test $([Guid]::NewGuid().ToString('N'))"
$form = $null
$textBox = $null
$process = $null

if (Test-Path -LiteralPath $storeDirectory) {
  Move-Item -LiteralPath $storeDirectory -Destination $storeBackupDirectory
}
New-Item -ItemType Directory -Path $storeDirectory -Force | Out-Null
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$testStore = @{
  version = 1
  settings = @{
    captureEnabled = $false
    pasteAfterCopy = $true
    globalShortcut = 'Alt+V'
  }
  items = @(
    @{
      kind = 'text'
      id = 'packaged-paste-test'
      pinned = $false
      copyCount = 0
      createdAt = $timestamp
      updatedAt = $timestamp
      text = $expectedText
    }
  )
}
$storeJson = $testStore | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText(
  (Join-Path $storeDirectory 'lightclip-store.json'),
  $storeJson,
  ([Text.UTF8Encoding]::new($false))
)

try {
  $process = Start-Process -FilePath $resolvedExecutable -ArgumentList '--hidden' -PassThru -WindowStyle Hidden
  $window = [IntPtr]::Zero
  $windowDeadline = [DateTime]::UtcNow.AddSeconds(15)
  while ($window -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $windowDeadline) {
    $process.Refresh()
    if ($process.HasExited) {
      throw "LightClip exited during startup with code $($process.ExitCode)."
    }

    $window = [LightClipShortcutProbe]::FindMainWindow([uint32] $process.Id)
    if ($window -eq [IntPtr]::Zero) {
      Start-Sleep -Milliseconds 100
    }
  }

  if ($window -eq [IntPtr]::Zero) {
    throw 'LightClip did not create its main window within 15 seconds.'
  }
  if ([LightClipShortcutProbe]::IsWindowVisible($window)) {
    throw 'LightClip ignored --hidden during the shortcut smoke test.'
  }
  $registrationDeadline = [DateTime]::UtcNow.AddSeconds(15)
  while (-not [LightClipShortcutProbe]::IsAltVRegistered() -and [DateTime]::UtcNow -lt $registrationDeadline) {
    $process.Refresh()
    if ($process.HasExited) {
      throw "LightClip exited before registering Alt+V with code $($process.ExitCode)."
    }
    Start-Sleep -Milliseconds 100
  }
  if (-not [LightClipShortcutProbe]::IsAltVRegistered()) {
    throw 'The packaged LightClip process did not register Alt+V with Windows.'
  }

  Add-Type -AssemblyName System.Windows.Forms
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'LightClip Paste Target'
  $form.Width = 480
  $form.Height = 160
  $form.StartPosition = 'CenterScreen'
  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Dock = [System.Windows.Forms.DockStyle]::Fill
  $textBox.Multiline = $true
  $form.Controls.Add($textBox)
  $form.Show()
  $form.Activate()
  [void]$textBox.Focus()
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 100

  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  [LightClipShortcutProbe]::SendAltV()
  $shortcutDeadline = [DateTime]::UtcNow.AddSeconds(3)
  while (-not [LightClipShortcutProbe]::IsWindowVisible($window) -and [DateTime]::UtcNow -lt $shortcutDeadline) {
    Start-Sleep -Milliseconds 25
  }
  $stopwatch.Stop()

  if (-not [LightClipShortcutProbe]::IsWindowVisible($window)) {
    throw 'Alt+V did not show the packaged LightClip window within 3 seconds.'
  }

  Write-Host "Packaged Alt+V opened LightClip in $($stopwatch.ElapsedMilliseconds) ms."

  # Visibility can precede the first WebView render on a cold CI machine.
  Start-Sleep -Milliseconds 150
  [LightClipShortcutProbe]::SendEnter()
  $pasteDeadline = [DateTime]::UtcNow.AddSeconds(3)
  while ($textBox.Text -ne $expectedText -and [DateTime]::UtcNow -lt $pasteDeadline) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 25
  }
  if ($textBox.Text -ne $expectedText) {
    throw "Paste-after-copy did not fill the focused textbox. Actual text: '$($textBox.Text)'"
  }
  Write-Host 'Packaged paste-after-copy restored the focused textbox and inserted the selected item.'
}
finally {
  if ($null -ne $form) {
    $form.Close()
    $form.Dispose()
  }
  if ($null -ne $process) {
    $process.Refresh()
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
      $process.WaitForExit()
    }
  }
  if (Test-Path -LiteralPath $storeDirectory) {
    Remove-Item -LiteralPath $storeDirectory -Recurse -Force
  }
  if (Test-Path -LiteralPath $storeBackupDirectory) {
    Move-Item -LiteralPath $storeBackupDirectory -Destination $storeDirectory
  }
}
