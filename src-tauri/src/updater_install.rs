//! Signed Windows update handoff. The renderer never supplies executable paths or bytes.

use serde::Serialize;
use std::{fs, io::Write, path::Path, sync::atomic::{AtomicBool, Ordering}};
use tauri::{ipc::Channel, Manager, Webview};
use tauri_plugin_updater::Update;

static INSTALLING: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static PENDING_INSTALLER: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

/// Owns one download/handoff attempt; failed attempts always release the retry gate.
struct InstallGuard;
impl InstallGuard {
  fn acquire() -> Result<Self, String> {
    INSTALLING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .map(|_| Self).map_err(|_| "An update installation is already in progress.".to_string())
  }
}
impl Drop for InstallGuard {
  fn drop(&mut self) { INSTALLING.store(false, Ordering::Release); }
}

/// Download events preserve the plugin contract; Installing follows signature verification.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub(crate) enum InstallEvent {
  #[serde(rename_all = "camelCase")]
  Started { content_length: Option<u64> },
  #[serde(rename_all = "camelCase")]
  Progress { chunk_length: usize },
  Finished,
  Installing,
}

/// Downloads an existing updater resource, verifies its signature, and confirms installer UI
/// before exiting. Download/launch errors leave the running app and history untouched.
#[tauri::command]
pub(crate) async fn install_signed_update(webview: Webview, rid: u32, on_event: Channel<InstallEvent>) -> Result<(), String> {
  let _guard = InstallGuard::acquire()?;
  let result = install_inner(&webview, rid, on_event).await;
  if let Err(error) = &result { log::error!("Update handoff failed; application retained: {error}"); }
  result
}

#[cfg(windows)]
async fn install_inner(webview: &Webview, rid: u32, on_event: Channel<InstallEvent>) -> Result<(), String> {
  ensure_no_pending_installer()?;
  // Only the plugin-created resource is accepted, never a renderer-supplied download URL.
  let update = webview.resources_table().get::<Update>(rid).map_err(|e| e.to_string())?;
  if !update.download_url.path().ends_with("-setup.exe") {
    return Err("Unsupported update package; please download the Windows installer from Releases.".into());
  }
  let mut first_chunk = true;
  let bytes = update.download(|chunk_length, content_length| {
    if first_chunk {
      first_chunk = false;
      let _ = on_event.send(InstallEvent::Started { content_length });
    }
    let _ = on_event.send(InstallEvent::Progress { chunk_length });
  }, || { let _ = on_event.send(InstallEvent::Finished); }).await.map_err(|e| e.to_string())?;
  // download() returns only after signature verification. Finished alone does NOT imply verification.
  let _ = on_event.send(InstallEvent::Installing);
  let directory = webview.app_handle().path().app_local_data_dir().map_err(|e| e.to_string())?
    .join("updates").join(uuid::Uuid::new_v4().to_string());
  let pid = tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
    let path = directory.join("LightClip-update-setup.exe");
    write_verified_installer(&path, &bytes).map_err(|e| format!("Could not save verified installer: {e}"))?;
    log::info!("Starting verified update installer: {}", path.display());
    // Keep the installer on disk: it still needs this file after the application exits.
    launch_visible_installer(&path)
  }).await.map_err(|e| e.to_string())??;
  log::info!("Verified update installer UI confirmed, pid={pid}; handing off application exit");
  webview.app_handle().exit(0);
  Ok(())
}

#[cfg(not(windows))]
async fn install_inner(_: &Webview, _: u32, _: Channel<InstallEvent>) -> Result<(), String> {
  Err("This installer handoff supports Windows only.".into())
}

/// Writes only already-verified PE bytes to a new, unique file and flushes before launch.
fn write_verified_installer(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  if !bytes.starts_with(b"MZ") {
    return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Expected a Windows executable"));
  }
  let parent = path.parent().ok_or_else(|| std::io::Error::other("Missing installer directory"))?;
  fs::create_dir_all(parent)?;
  let mut file = fs::OpenOptions::new().write(true).create_new(true).open(path)?;
  file.write_all(bytes)?;
  file.sync_all()
}

/// Full NSIS UI with relaunch; intentionally excludes passive/silent and inherited --hidden flags.
fn installer_arguments() -> [&'static str; 2] { ["/UPDATE", "/R"] }

/// Prevents a retry from starting a second installer while a slow/security-prompted one is alive.
#[cfg(windows)]
fn ensure_no_pending_installer() -> Result<(), String> {
  let mut pending = PENDING_INSTALLER.lock().map_err(|e| e.to_string())?;
  if let Some(child) = pending.as_mut() {
    if child.try_wait().map_err(|e| e.to_string())?.is_none() {
      return Err("An installer is still running. Check the taskbar/security prompt or close that installer before retrying.".into());
    }
  }
  *pending = None;
  Ok(())
}

/// Starts without a shell and waits for a visible window belonging to the installer process.
/// A blocked launch, early exit or missing UI is an error, not permission to close LightClip.
#[cfg(windows)]
fn launch_visible_installer(path: &Path) -> Result<u32, String> {
  use std::{ffi::c_void, process::Command, thread, time::{Duration, Instant}};
  type Hwnd = *mut c_void;
  struct Probe { pid: u32, window: Hwnd }
  #[link(name = "user32")]
  extern "system" {
    fn EnumWindows(callback: unsafe extern "system" fn(Hwnd, isize) -> i32, parameter: isize) -> i32;
    fn GetWindowThreadProcessId(window: Hwnd, process_id: *mut u32) -> u32;
    fn IsWindowVisible(window: Hwnd) -> i32;
    fn SetForegroundWindow(window: Hwnd) -> i32;
  }
  unsafe extern "system" fn find_window(window: Hwnd, parameter: isize) -> i32 {
    let probe = &mut *(parameter as *mut Probe);
    let mut pid = 0;
    GetWindowThreadProcessId(window, &mut pid);
    if pid == probe.pid && IsWindowVisible(window) != 0 {
      probe.window = window;
      return 0;
    }
    1
  }
  let mut child = Command::new(path).args(installer_arguments()).spawn()
    .map_err(|e| format!("Installer could not start (Windows: {e}). Check security software notifications or use browser download."))?;
  let deadline = Instant::now() + Duration::from_secs(15);
  loop {
    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
      return Err(format!("Installer exited before showing its window ({status}); LightClip has not been closed."));
    }
    let mut probe = Probe { pid: child.id(), window: std::ptr::null_mut() };
    unsafe { EnumWindows(find_window, &mut probe as *mut Probe as isize); }
    if !probe.window.is_null() {
      unsafe { SetForegroundWindow(probe.window); }
      return Ok(child.id());
    }
    if Instant::now() >= deadline {
      *PENDING_INSTALLER.lock().map_err(|e| e.to_string())? = Some(child);
      return Err("Installer window was not detected within 15 seconds. LightClip remains open; check the taskbar and security notifications before retrying.".into());
    }
    thread::sleep(Duration::from_millis(50));
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn installer_is_interactive_and_does_not_inherit_hidden_startup() {
    assert_eq!(installer_arguments(), ["/UPDATE", "/R"]);
  }

  #[test]
  fn verified_file_is_never_overwritten_and_invalid_payload_is_rejected() {
    let root = std::env::temp_dir().join(format!("lightclip-update-test-{}", uuid::Uuid::new_v4()));
    let file = root.join("fixture.exe");
    assert!(write_verified_installer(&file, b"not an executable").is_err());
    assert!(!root.exists());
    write_verified_installer(&file, b"MZ-test-fixture").unwrap();
    assert!(write_verified_installer(&file, b"MZ-replacement").is_err());
    assert_eq!(fs::read(&file).unwrap(), b"MZ-test-fixture");
    fs::remove_dir_all(root).unwrap();
  }

  #[test]
  fn failure_releases_install_gate_for_retry() {
    let first = InstallGuard::acquire().unwrap();
    assert!(InstallGuard::acquire().is_err());
    drop(first);
    assert!(InstallGuard::acquire().is_ok());
  }

  #[cfg(windows)]
  #[test]
  fn missing_installer_returns_error_instead_of_exiting_application() {
    let missing = std::env::temp_dir().join(format!("missing-{}.exe", uuid::Uuid::new_v4()));
    assert!(launch_visible_installer(&missing).is_err());
    // Reaching this assertion proves that failed launch did not terminate the test process.
    assert!(!missing.exists());
  }

  /// Explicit GitHub-only probe of the packaged NSIS installer, never run on the user's desktop.
  /// The runner is disposable; this installs the package and may relaunch it.
  #[cfg(windows)]
  #[test]
  #[ignore = "requires an isolated Windows runner and a packaged NSIS installer"]
  fn packaged_installer_opens_visible_ui() {
    assert_eq!(std::env::var("GITHUB_ACTIONS").as_deref(), Ok("true"));
    let path = std::env::var_os("LIGHTCLIP_INSTALLER_PROBE").expect("installer path is required");
    let pid = launch_visible_installer(Path::new(&path)).expect("installer must expose a visible window");
    assert!(pid > 0);
  }
}
