use arboard::{Clipboard, ImageData};
use base64::Engine;
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::ffi::c_void;
use std::{
  borrow::Cow,
  collections::HashSet,
  fs,
  io::{Cursor, Read, Write},
  path::{Path, PathBuf},
  process::Command,
  sync::{Arc, Mutex},
  thread,
  time::Duration,
};
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use uuid::Uuid;

const STORE_VERSION: u32 = 1;
const STORE_FILE_NAME: &str = "lightclip-store.json.br";
const BACKUP_STORE_FILE_NAME: &str = "lightclip-store.json.br.bak";
const LEGACY_STORE_FILE_NAME: &str = "lightclip-store.json";
const STORAGE_CONFIG_FILE_NAME: &str = "lightclip-storage.json";
const RELEASE_API_URL: &str = "https://api.github.com/repos/leaf-zly/lightclip/releases/latest";
const RELEASE_URL_PREFIX: &str = "https://github.com/leaf-zly/lightclip/";
const APP_DATA_DIRECTORY_NAME: &str = "LightClip";
const LEGACY_TAURI_DATA_DIRECTORY_NAME: &str = "lightclip-electron";
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const MAX_TEMPORARY_PAUSE_MS: i64 = DAY_MS;
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
type WindowHandle = *mut c_void;

#[cfg(windows)]
#[repr(C)]
struct NativeRect {
  left: i32,
  top: i32,
  right: i32,
  bottom: i32,
}

#[cfg(windows)]
#[repr(C)]
struct GuiThreadInfo {
  size: u32,
  flags: u32,
  active_window: WindowHandle,
  focused_window: WindowHandle,
  capture_window: WindowHandle,
  menu_owner_window: WindowHandle,
  move_size_window: WindowHandle,
  caret_window: WindowHandle,
  caret_rect: NativeRect,
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
  fn GetForegroundWindow() -> WindowHandle;
  fn GetWindowThreadProcessId(window: WindowHandle, process_id: *mut u32) -> u32;
  fn GetGUIThreadInfo(thread_id: u32, info: *mut GuiThreadInfo) -> i32;
}

#[derive(Clone)]
struct AppRuntime {
  store: Arc<Mutex<ClipboardStore>>,
  paste_target: Arc<Mutex<Option<String>>>,
  last_clipboard_signature: Arc<Mutex<String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedStore {
  version: u32,
  #[serde(default)]
  settings: AppSettings,
  #[serde(default)]
  items: Vec<ClipboardItem>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
  capture_enabled: bool,
  capture_paused_until: Option<i64>,
  launch_at_login: bool,
  max_history_items: usize,
  min_text_length: usize,
  max_text_length: usize,
  capture_images: bool,
  capture_files: bool,
  encrypt_store: bool,
  excluded_app_names: Vec<String>,
  paste_after_copy: bool,
  max_image_bytes: usize,
  max_file_paths: usize,
  retention_days: i64,
  global_shortcut: String,
  theme_accent: String,
  theme_mode: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
  items: Vec<ClipboardItem>,
  settings: AppSettings,
  storage_bytes: u64,
  storage_directory: String,
  storage_file_path: String,
  storage_compression: String,
  storage_encrypted: bool,
  encryption_available: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum ClipboardItem {
  #[serde(rename = "text")]
  Text {
    id: String,
    pinned: bool,
    copy_count: u32,
    created_at: i64,
    updated_at: i64,
    text: String,
  },
  #[serde(rename = "image")]
  Image {
    id: String,
    pinned: bool,
    copy_count: u32,
    created_at: i64,
    updated_at: i64,
    data_url: String,
    width: u32,
    height: u32,
    byte_size: usize,
  },
  #[serde(rename = "file")]
  File {
    id: String,
    pinned: bool,
    copy_count: u32,
    created_at: i64,
    updated_at: i64,
    paths: Vec<String>,
  },
}

#[derive(Serialize)]
struct CommandResult<T>
where
  T: Serialize,
{
  ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  data: Option<T>,
  #[serde(skip_serializing_if = "Option::is_none")]
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageLocationResult {
  directory: String,
  file_path: String,
  storage_bytes: u64,
  compression: String,
  encrypted: bool,
  encryption_available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryExportResult {
  file_path: String,
  item_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryImportResult {
  file_path: String,
  imported_count: usize,
  total_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
  current_version: String,
  latest_version: String,
  update_available: bool,
  release_url: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageConfig {
  storage_directory: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryExportSnapshot {
  version: u32,
  exported_at: String,
  settings: AppSettings,
  items: Vec<ClipboardItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPersistedStore {
  version: Option<u32>,
  settings: Option<AppSettings>,
  items: Option<Vec<serde_json::Value>>,
}

struct ClipboardSnapshot {
  signature: String,
  text: String,
  image: Option<ClipboardImageSnapshot>,
  files: Vec<String>,
}

struct ClipboardImageSnapshot {
  data_url: String,
  width: u32,
  height: u32,
  byte_size: usize,
}

struct ClipboardStore {
  default_storage_directory: PathBuf,
  storage_config_path: PathBuf,
  storage_directory: PathBuf,
  file_path: PathBuf,
  backup_file_path: PathBuf,
  legacy_file_path: PathBuf,
  state: PersistedStore,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_log::Builder::default().build())
    .setup(|app| {
      let mut store = ClipboardStore::new(default_storage_directory())?;
      store.load()?;
      apply_launch_at_login(store.state.settings.launch_at_login);

      let runtime = AppRuntime {
        store: Arc::new(Mutex::new(store)),
        paste_target: Arc::new(Mutex::new(None)),
        last_clipboard_signature: Arc::new(Mutex::new(String::new())),
      };
      app.manage(runtime.clone());
      let global_shortcut = runtime
        .store
        .lock()
        .map(|store| store.state.settings.global_shortcut.clone())
        .unwrap_or_else(|_| default_settings().global_shortcut);
      replace_global_shortcut(app.handle(), &global_shortcut)?;

      // Register the shortcut before clipboard inspection so optional file
      // format probing cannot delay or prevent the app's primary entry point.
      let initial_clipboard_signature = runtime
        .store
        .lock()
        .ok()
        .and_then(|store| read_clipboard_snapshot(&store.state.settings).ok())
        .map(|snapshot| snapshot.signature)
        .unwrap_or_default();
      if let Ok(mut signature) = runtime.last_clipboard_signature.lock() {
        *signature = initial_clipboard_signature;
      }
      start_clipboard_watcher(app.handle().clone(), runtime.clone());
      create_tray(app.handle())?;

      if !std::env::args().any(|arg| arg == "--hidden") {
        show_panel(app.handle(), &runtime)?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![
      get_state,
      copy_item,
      delete_item,
      toggle_pin,
      clear_history,
      clear_by_kind,
      export_history_to_path,
      import_history_from_path,
      check_for_updates,
      open_external_url,
      move_storage_directory,
      reset_storage_directory,
      open_storage_directory,
      update_settings,
      minimize_window,
      toggle_maximize_window,
      close_window,
      hide_panel,
      show_panel_command,
      quit_app
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
  let show_item = MenuItem::with_id(app, "show", "打开 LightClip", true, None::<&str>)?;
  let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
  let mut builder = TrayIconBuilder::with_id("lightclip-tray")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .tooltip("LightClip")
    .on_menu_event(|app, event| match event.id.as_ref() {
      "show" => {
        let runtime = app.state::<AppRuntime>();
        let _ = show_panel(app, &runtime);
      }
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if matches!(
        event,
        TrayIconEvent::Click {
          button: MouseButton::Left,
          button_state: MouseButtonState::Up,
          ..
        }
      ) {
        let app = tray.app_handle();
        let runtime = app.state::<AppRuntime>();
        let _ = show_panel(app, &runtime);
      }
    });
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder.build(app)?;
  Ok(())
}

#[tauri::command]
fn get_state(runtime: State<'_, AppRuntime>) -> AppState {
  runtime.store.lock().expect("store lock poisoned").state_snapshot()
}

#[tauri::command]
fn copy_item(id: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<ClipboardItem> {
  let (item, settings) = {
    let store = runtime.store.lock().expect("store lock poisoned");
    match store.get_item(&id) {
      Some(item) => (item, store.state.settings.clone()),
      None => return err("记录不存在"),
    }
  };

  let _ = hide_panel_impl(&app);
  let write_signature = match write_item_to_clipboard(&item, &settings) {
    Ok(signature) => signature,
    Err(error) => {
      return err(format!("复制失败: {error}"));
    }
  };
  if !write_signature.is_empty() {
    if let Ok(mut signature) = runtime.last_clipboard_signature.lock() {
      *signature = write_signature;
    }
  }

  {
    let mut store = runtime.store.lock().expect("store lock poisoned");
    let _ = store.touch_copied_item(&id);
  }
  broadcast_state(&app, &runtime);

  if settings.paste_after_copy {
    let target = runtime.paste_target.lock().ok().and_then(|mut value| value.take());
    if let Some(target) = target {
      thread::spawn(move || {
        let _ = paste_to_target(&target);
      });
    }
  }

  ok(item)
}

#[tauri::command]
fn delete_item(id: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<()> {
  let changed = runtime.store.lock().expect("store lock poisoned").delete_item(&id);
  if changed {
    broadcast_state(&app, &runtime);
  }
  ok_unit()
}

#[tauri::command]
fn toggle_pin(id: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<ClipboardItem> {
  let result = runtime.store.lock().expect("store lock poisoned").toggle_pin(&id);
  match result {
    Ok(Some(item)) => {
      broadcast_state(&app, &runtime);
      ok(item)
    }
    Ok(None) => err("记录不存在"),
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn clear_history(app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<()> {
  if let Err(error) = runtime.store.lock().expect("store lock poisoned").clear_history() {
    return err(error.to_string());
  }
  broadcast_state(&app, &runtime);
  ok_unit()
}

#[tauri::command]
fn clear_by_kind(kind: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<()> {
  if let Err(error) = runtime.store.lock().expect("store lock poisoned").clear_by_kind(&kind) {
    return err(error.to_string());
  }
  broadcast_state(&app, &runtime);
  ok_unit()
}

#[tauri::command]
fn export_history_to_path(file_path: String, runtime: State<'_, AppRuntime>) -> CommandResult<HistoryExportResult> {
  let result = runtime.store.lock().expect("store lock poisoned").export_history(&file_path);
  match result {
    Ok(item_count) => ok(HistoryExportResult { file_path, item_count }),
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn import_history_from_path(file_path: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<HistoryImportResult> {
  let result = runtime.store.lock().expect("store lock poisoned").import_history(&file_path);
  match result {
    Ok((imported_count, total_count)) => {
      broadcast_state(&app, &runtime);
      ok(HistoryImportResult {
        file_path,
        imported_count,
        total_count,
      })
    }
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn check_for_updates(app: AppHandle) -> CommandResult<UpdateCheckResult> {
  match fetch_latest_release() {
    Ok((latest_version, release_url)) => {
      let current_version = app.package_info().version.to_string();
      ok(UpdateCheckResult {
        update_available: compare_semver(&latest_version, &current_version) > 0,
        current_version,
        latest_version,
        release_url,
      })
    }
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn open_external_url(url: String) -> CommandResult<()> {
  if !url.starts_with(RELEASE_URL_PREFIX) {
    return err("不允许打开该链接");
  }
  match open::that(url) {
    Ok(_) => ok_unit(),
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn move_storage_directory(directory: String, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<StorageLocationResult> {
  let result = runtime.store.lock().expect("store lock poisoned").move_storage_directory(&directory);
  match result {
    Ok(location) => {
      broadcast_state(&app, &runtime);
      ok(location)
    }
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn reset_storage_directory(app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<StorageLocationResult> {
  let result = runtime.store.lock().expect("store lock poisoned").reset_storage_directory();
  match result {
    Ok(location) => {
      broadcast_state(&app, &runtime);
      ok(location)
    }
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn open_storage_directory(runtime: State<'_, AppRuntime>) -> CommandResult<()> {
  let directory = runtime
    .store
    .lock()
    .expect("store lock poisoned")
    .storage_directory
    .clone();
  match open::that(directory) {
    Ok(_) => ok_unit(),
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn update_settings(settings: AppSettingsPatch, app: AppHandle, runtime: State<'_, AppRuntime>) -> CommandResult<AppSettings> {
  let (result, previous_shortcut) = {
    let mut store = runtime.store.lock().expect("store lock poisoned");
    let previous_shortcut = store.state.settings.global_shortcut.clone();
    (store.update_settings(settings), previous_shortcut)
  };
  match result {
    Ok(settings) => {
      if settings.global_shortcut != previous_shortcut {
        if let Err(error) = replace_global_shortcut(&app, &settings.global_shortcut) {
          // Registration can fail when another application owns the shortcut.
          // Restore both the OS registration and persisted setting atomically.
          let _ = replace_global_shortcut(&app, &previous_shortcut);
          if let Ok(mut store) = runtime.store.lock() {
            store.state.settings.global_shortcut = previous_shortcut;
            let _ = store.save();
          }
          broadcast_state(&app, &runtime);
          return err(format!("快捷键注册失败: {error}"));
        }
      }
      apply_launch_at_login(settings.launch_at_login);
      broadcast_state(&app, &runtime);
      ok(settings)
    }
    Err(error) => err(error.to_string()),
  }
}

#[tauri::command]
fn minimize_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.minimize();
  }
}

#[tauri::command]
fn toggle_maximize_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    if window.is_maximized().unwrap_or(false) {
      let _ = window.unmaximize();
    } else {
      let _ = window.maximize();
    }
  }
}

#[tauri::command]
fn close_window(app: AppHandle) {
  let _ = hide_panel_impl(&app);
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
  let _ = hide_panel_impl(&app);
}

#[tauri::command]
fn show_panel_command(app: AppHandle, runtime: State<'_, AppRuntime>) -> Result<(), String> {
  show_panel(&app, &runtime).map_err(|error| error.to_string())
}

fn toggle_panel_impl(app: &AppHandle, runtime: &AppRuntime) -> anyhow::Result<()> {
  let Some(window) = app.get_webview_window("main") else {
    return Ok(());
  };
  if window.is_visible().unwrap_or(false) {
    window.hide()?;
    return Ok(());
  }
  show_panel(app, runtime)
}

fn replace_global_shortcut(app: &AppHandle, shortcut: &str) -> anyhow::Result<()> {
  let manager = app.global_shortcut();
  manager.unregister_all()?;
  manager.on_shortcut(shortcut.trim(), handle_global_shortcut)?;
  Ok(())
}

fn handle_global_shortcut(
  app: &AppHandle,
  _shortcut: &tauri_plugin_global_shortcut::Shortcut,
  event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
  if event.state != ShortcutState::Pressed {
    return;
  }

  let runtime = app.state::<AppRuntime>();
  if let Err(error) = toggle_panel_impl(app, &runtime) {
    log::error!("Failed to toggle LightClip from the global shortcut: {error}");
  }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
  app.exit(0);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettingsPatch {
  capture_enabled: Option<bool>,
  capture_paused_until: Option<Option<i64>>,
  launch_at_login: Option<bool>,
  max_history_items: Option<usize>,
  min_text_length: Option<usize>,
  max_text_length: Option<usize>,
  capture_images: Option<bool>,
  capture_files: Option<bool>,
  encrypt_store: Option<bool>,
  excluded_app_names: Option<Vec<String>>,
  paste_after_copy: Option<bool>,
  max_image_bytes: Option<usize>,
  max_file_paths: Option<usize>,
  retention_days: Option<i64>,
  global_shortcut: Option<String>,
  theme_accent: Option<String>,
  theme_mode: Option<String>,
}

impl ClipboardStore {
  fn new(default_storage_directory: PathBuf) -> anyhow::Result<Self> {
    let storage_config_path = default_storage_directory.join(STORAGE_CONFIG_FILE_NAME);
    let mut store = Self {
      default_storage_directory: default_storage_directory.clone(),
      storage_config_path,
      storage_directory: default_storage_directory,
      file_path: PathBuf::new(),
      backup_file_path: PathBuf::new(),
      legacy_file_path: PathBuf::new(),
      state: PersistedStore {
        version: STORE_VERSION,
        settings: default_settings(),
        items: Vec::new(),
      },
    };
    store.set_storage_directory(store.storage_directory.clone());
    Ok(store)
  }

  fn load(&mut self) -> anyhow::Result<()> {
    self.load_storage_config();
    match self.read_persisted_store() {
      Ok(mut persisted) => {
        persisted.settings = normalize_settings(persisted.settings);
        persisted.items = persisted.items.into_iter().filter(ClipboardItem::is_valid).collect();
        self.state = persisted;
        self.trim_overflow();
        self.save()?;
      }
      Err(error) if is_missing_store(&error) => {
        self.save()?;
      }
      Err(error) => {
        eprintln!("Failed to load LightClip store, using defaults: {error}");
        self.quarantine_unreadable_store_files();
        self.save()?;
      }
    }
    Ok(())
  }

  fn state_snapshot(&self) -> AppState {
    AppState {
      items: self.sorted_items(),
      settings: self.state.settings.clone(),
      storage_bytes: self.storage_bytes(),
      storage_directory: self.storage_directory.to_string_lossy().to_string(),
      storage_file_path: self.file_path.to_string_lossy().to_string(),
      storage_compression: "brotli".to_string(),
      storage_encrypted: false,
      encryption_available: false,
    }
  }

  fn storage_location(&self) -> StorageLocationResult {
    StorageLocationResult {
      directory: self.storage_directory.to_string_lossy().to_string(),
      file_path: self.file_path.to_string_lossy().to_string(),
      storage_bytes: self.storage_bytes(),
      compression: "brotli".to_string(),
      encrypted: false,
      encryption_available: false,
    }
  }

  fn record_text(&mut self, text: &str) -> anyhow::Result<Option<ClipboardItem>> {
    let normalized = normalize_clipboard_text(text);
    if !self.can_capture_text(&normalized) {
      return Ok(None);
    }

    let now = now_ms();
    if let Some(item) = self
      .state
      .items
      .iter_mut()
      .find(|item| matches!(item, ClipboardItem::Text { text, .. } if text == &normalized))
    {
      item.set_updated_at(now);
      let cloned = item.clone();
      self.save()?;
      return Ok(Some(cloned));
    }

    let item = ClipboardItem::Text {
      id: create_item_id(),
      pinned: false,
      copy_count: 0,
      created_at: now,
      updated_at: now,
      text: normalized,
    };
    self.state.items.insert(0, item.clone());
    self.trim_overflow();
    self.save()?;
    Ok(Some(item))
  }

  fn record_image(&mut self, image: ClipboardImageSnapshot) -> anyhow::Result<Option<ClipboardItem>> {
    if !self.can_capture_image(image.byte_size) {
      return Ok(None);
    }

    let now = now_ms();
    if let Some(item) = self
      .state
      .items
      .iter_mut()
      .find(|item| matches!(item, ClipboardItem::Image { data_url, .. } if data_url == &image.data_url))
    {
      item.set_updated_at(now);
      let cloned = item.clone();
      self.save()?;
      return Ok(Some(cloned));
    }

    let item = ClipboardItem::Image {
      id: create_item_id(),
      pinned: false,
      copy_count: 0,
      created_at: now,
      updated_at: now,
      data_url: image.data_url,
      width: image.width,
      height: image.height,
      byte_size: image.byte_size,
    };
    self.state.items.insert(0, item.clone());
    self.trim_overflow();
    self.save()?;
    Ok(Some(item))
  }

  fn record_files(&mut self, paths: Vec<String>) -> anyhow::Result<Option<ClipboardItem>> {
    let normalized_paths = normalize_file_paths(paths);
    if !self.can_capture_files(&normalized_paths) {
      return Ok(None);
    }

    let now = now_ms();
    let signature = create_file_signature(&normalized_paths);
    if let Some(item) = self
      .state
      .items
      .iter_mut()
      .find(|item| matches!(item, ClipboardItem::File { paths, .. } if create_file_signature(paths) == signature))
    {
      item.set_updated_at(now);
      let cloned = item.clone();
      self.save()?;
      return Ok(Some(cloned));
    }

    let item = ClipboardItem::File {
      id: create_item_id(),
      pinned: false,
      copy_count: 0,
      created_at: now,
      updated_at: now,
      paths: normalized_paths,
    };
    self.state.items.insert(0, item.clone());
    self.trim_overflow();
    self.save()?;
    Ok(Some(item))
  }

  fn record_snapshot(&mut self, snapshot: ClipboardSnapshot) -> anyhow::Result<Option<ClipboardItem>> {
    if self.is_foreground_app_excluded() {
      return Ok(None);
    }

    if self.state.settings.capture_files && !snapshot.files.is_empty() {
      return self.record_files(snapshot.files);
    }

    if self.state.settings.capture_images {
      if let Some(image) = snapshot.image {
        return self.record_image(image);
      }
    }

    self.record_text(&snapshot.text)
  }

  fn get_item(&self, id: &str) -> Option<ClipboardItem> {
    self.state.items.iter().find(|item| item.id() == id).cloned()
  }

  fn touch_copied_item(&mut self, id: &str) -> anyhow::Result<Option<ClipboardItem>> {
    let result = self.state.items.iter_mut().find(|item| item.id() == id).map(|item| {
      item.increment_copy_count();
      item.set_updated_at(now_ms());
      item.clone()
    });
    if result.is_some() {
      self.save()?;
    }
    Ok(result)
  }

  fn delete_item(&mut self, id: &str) -> bool {
    let before = self.state.items.len();
    self.state.items.retain(|item| item.id() != id);
    let changed = before != self.state.items.len();
    if changed {
      let _ = self.save();
    }
    changed
  }

  fn toggle_pin(&mut self, id: &str) -> anyhow::Result<Option<ClipboardItem>> {
    let result = self.state.items.iter_mut().find(|item| item.id() == id).map(|item| {
      item.toggle_pin();
      item.set_updated_at(now_ms());
      item.clone()
    });
    if result.is_some() {
      self.save()?;
    }
    Ok(result)
  }

  fn clear_history(&mut self) -> anyhow::Result<()> {
    self.state.items.retain(ClipboardItem::pinned);
    self.save()
  }

  fn clear_by_kind(&mut self, kind: &str) -> anyhow::Result<()> {
    self.state.items.retain(|item| item.pinned() || item.kind() != kind);
    self.save()
  }

  fn export_history(&self, file_path: &str) -> anyhow::Result<usize> {
    let snapshot = HistoryExportSnapshot {
      version: STORE_VERSION,
      exported_at: now_rfc3339(),
      settings: self.state.settings.clone(),
      items: self.sorted_items(),
    };
    let payload = serde_json::to_string_pretty(&snapshot)?;
    fs::write(file_path, payload)?;
    Ok(snapshot.items.len())
  }

  fn import_history(&mut self, file_path: &str) -> anyhow::Result<(usize, usize)> {
    let raw = fs::read_to_string(file_path)?;
    let snapshot: RawPersistedStore = serde_json::from_str(&raw)?;
    let mut inserted = 0;
    for incoming in normalize_clipboard_items(snapshot.items.unwrap_or_default()) {
      if self.state.items.iter().any(|item| item.signature() == incoming.signature()) {
        continue;
      }
      self.state.items.push(incoming);
      inserted += 1;
    }
    self.trim_overflow();
    self.save()?;
    Ok((inserted, self.state.items.len()))
  }

  fn update_settings(&mut self, patch: AppSettingsPatch) -> anyhow::Result<AppSettings> {
    if let Some(value) = patch.capture_enabled {
      self.state.settings.capture_enabled = value;
    }
    if let Some(value) = patch.capture_paused_until {
      self.state.settings.capture_paused_until = value;
    }
    if let Some(value) = patch.launch_at_login {
      self.state.settings.launch_at_login = value;
    }
    if let Some(value) = patch.max_history_items {
      self.state.settings.max_history_items = value;
    }
    if let Some(value) = patch.min_text_length {
      self.state.settings.min_text_length = value;
    }
    if let Some(value) = patch.max_text_length {
      self.state.settings.max_text_length = value;
    }
    if let Some(value) = patch.capture_images {
      self.state.settings.capture_images = value;
    }
    if let Some(value) = patch.capture_files {
      self.state.settings.capture_files = value;
    }
    if let Some(value) = patch.encrypt_store {
      self.state.settings.encrypt_store = value;
    }
    if let Some(value) = patch.excluded_app_names {
      self.state.settings.excluded_app_names = value;
    }
    if let Some(value) = patch.paste_after_copy {
      self.state.settings.paste_after_copy = value;
    }
    if let Some(value) = patch.max_image_bytes {
      self.state.settings.max_image_bytes = value;
    }
    if let Some(value) = patch.max_file_paths {
      self.state.settings.max_file_paths = value;
    }
    if let Some(value) = patch.retention_days {
      self.state.settings.retention_days = value;
    }
    if let Some(value) = patch.global_shortcut {
      self.state.settings.global_shortcut = value;
    }
    if let Some(value) = patch.theme_accent {
      self.state.settings.theme_accent = value;
    }
    if let Some(value) = patch.theme_mode {
      self.state.settings.theme_mode = value;
    }
    self.state.settings = normalize_settings(self.state.settings.clone());
    self.trim_overflow();
    self.save()?;
    Ok(self.state.settings.clone())
  }

  fn move_storage_directory(&mut self, directory: &str) -> anyhow::Result<StorageLocationResult> {
    let target = PathBuf::from(directory);
    fs::create_dir_all(&target)?;
    let probe = target.join(".lightclip-write-test");
    fs::write(&probe, "")?;
    let _ = fs::remove_file(probe);

    self.set_storage_directory(target.clone());
    self.save()?;
    self.write_storage_config(&target)?;
    Ok(self.storage_location())
  }

  fn reset_storage_directory(&mut self) -> anyhow::Result<StorageLocationResult> {
    let target = self.default_storage_directory.clone();
    self.set_storage_directory(target.clone());
    self.save()?;
    self.write_storage_config(&target)?;
    Ok(self.storage_location())
  }

  fn can_capture_text(&self, text: &str) -> bool {
    let settings = &self.state.settings;
    settings.capture_enabled
      && !is_capture_temporarily_paused(settings.capture_paused_until)
      && text.len() >= settings.min_text_length
      && text.len() <= settings.max_text_length
  }

  fn can_capture_image(&self, byte_size: usize) -> bool {
    let settings = &self.state.settings;
    settings.capture_enabled
      && !is_capture_temporarily_paused(settings.capture_paused_until)
      && settings.capture_images
      && byte_size > 0
      && byte_size <= settings.max_image_bytes
  }

  fn can_capture_files(&self, paths: &[String]) -> bool {
    let settings = &self.state.settings;
    settings.capture_enabled
      && !is_capture_temporarily_paused(settings.capture_paused_until)
      && settings.capture_files
      && !paths.is_empty()
      && paths.len() <= settings.max_file_paths
  }

  fn is_foreground_app_excluded(&self) -> bool {
    if self.state.settings.excluded_app_names.is_empty() {
      return false;
    }
    let Some(process_name) = read_foreground_process_name() else {
      return false;
    };
    let normalized_process_name = normalize_process_name(&process_name);
    self
      .state
      .settings
      .excluded_app_names
      .iter()
      .any(|app_name| normalize_process_name(app_name) == normalized_process_name)
  }

  fn sorted_items(&self) -> Vec<ClipboardItem> {
    let mut items = self.state.items.clone();
    items.sort_by(|left, right| {
      right
        .pinned()
        .cmp(&left.pinned())
        .then_with(|| right.updated_at().cmp(&left.updated_at()))
    });
    items
  }

  fn trim_overflow(&mut self) {
    let retention_cutoff = if self.state.settings.retention_days > 0 {
      Some(now_ms() - self.state.settings.retention_days * 24 * 60 * 60 * 1000)
    } else {
      None
    };
    let mut pinned: Vec<_> = self.state.items.iter().filter(|item| item.pinned()).cloned().collect();
    let mut regular: Vec<_> = self
      .state
      .items
      .iter()
      .filter(|item| !item.pinned() && retention_cutoff.map_or(true, |cutoff| item.updated_at() >= cutoff))
      .cloned()
      .collect();
    regular.sort_by_key(|item| std::cmp::Reverse(item.updated_at()));
    regular.truncate(self.state.settings.max_history_items);
    pinned.extend(regular);
    self.state.items = pinned;
  }

  fn load_storage_config(&mut self) {
    let Ok(raw) = fs::read_to_string(&self.storage_config_path) else {
      return;
    };
    let Ok(config) = serde_json::from_str::<StorageConfig>(&raw) else {
      return;
    };
    if let Some(directory) = config.storage_directory.filter(|value| !value.trim().is_empty()) {
      self.set_storage_directory(PathBuf::from(directory));
    }
  }

  fn read_persisted_store(&self) -> anyhow::Result<PersistedStore> {
    if self.file_path.exists() {
      match read_compressed_store_file(&self.file_path) {
        Ok(store) => return Ok(store),
        Err(error) if self.backup_file_path.exists() => {
          eprintln!("Primary LightClip store is unreadable, trying backup: {error}");
          return read_compressed_store_file(&self.backup_file_path);
        }
        Err(error) => return Err(error),
      }
    }
    if self.legacy_file_path.exists() {
      let raw = fs::read_to_string(&self.legacy_file_path)?;
      return parse_persisted_store(&raw);
    }
    if self.backup_file_path.exists() {
      return read_compressed_store_file(&self.backup_file_path);
    }
    anyhow::bail!("missing store")
  }

  fn set_storage_directory(&mut self, directory: PathBuf) {
    self.storage_directory = directory;
    self.file_path = self.storage_directory.join(STORE_FILE_NAME);
    self.backup_file_path = self.storage_directory.join(BACKUP_STORE_FILE_NAME);
    self.legacy_file_path = self.storage_directory.join(LEGACY_STORE_FILE_NAME);
  }

  fn write_storage_config(&self, directory: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(&self.default_storage_directory)?;
    if directory == self.default_storage_directory {
      let _ = fs::remove_file(&self.storage_config_path);
      return Ok(());
    }
    let config = StorageConfig {
      storage_directory: Some(directory.to_string_lossy().to_string()),
    };
    fs::write(&self.storage_config_path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
  }

  fn storage_bytes(&self) -> u64 {
    fs::metadata(&self.file_path)
      .or_else(|_| fs::metadata(&self.legacy_file_path))
      .map(|metadata| metadata.len())
      .unwrap_or(0)
  }

  fn quarantine_unreadable_store_files(&self) {
    let suffix = format!("corrupt-{}", now_ms());
    for path in [&self.file_path, &self.backup_file_path, &self.legacy_file_path] {
      if path.exists() {
        let target = path.with_file_name(format!(
          "{}.{suffix}",
          path.file_name().and_then(|name| name.to_str()).unwrap_or("lightclip-store")
        ));
        let _ = fs::rename(path, target);
      }
    }
  }

  fn save(&self) -> anyhow::Result<()> {
    fs::create_dir_all(&self.storage_directory)?;
    let payload = serde_json::to_string(&self.state)?;
    let encoded = compress_store_payload(&payload)?;
    parse_persisted_store(&decompress_store_payload(&encoded)?)?;
    if self.file_path.exists() {
      let _ = fs::copy(&self.file_path, &self.backup_file_path);
    }
    write_atomic(&self.file_path, &encoded)?;
    let _ = fs::remove_file(&self.legacy_file_path);
    Ok(())
  }
}

impl ClipboardItem {
  fn id(&self) -> &str {
    match self {
      Self::Text { id, .. } | Self::Image { id, .. } | Self::File { id, .. } => id,
    }
  }

  fn kind(&self) -> &'static str {
    match self {
      Self::Text { .. } => "text",
      Self::Image { .. } => "image",
      Self::File { .. } => "file",
    }
  }

  fn pinned(&self) -> bool {
    match self {
      Self::Text { pinned, .. } | Self::Image { pinned, .. } | Self::File { pinned, .. } => *pinned,
    }
  }

  fn updated_at(&self) -> i64 {
    match self {
      Self::Text { updated_at, .. } | Self::Image { updated_at, .. } | Self::File { updated_at, .. } => *updated_at,
    }
  }

  fn set_updated_at(&mut self, value: i64) {
    match self {
      Self::Text { updated_at, .. } | Self::Image { updated_at, .. } | Self::File { updated_at, .. } => *updated_at = value,
    }
  }

  fn toggle_pin(&mut self) {
    match self {
      Self::Text { pinned, .. } | Self::Image { pinned, .. } | Self::File { pinned, .. } => *pinned = !*pinned,
    }
  }

  fn increment_copy_count(&mut self) {
    match self {
      Self::Text { copy_count, .. } | Self::Image { copy_count, .. } | Self::File { copy_count, .. } => *copy_count += 1,
    }
  }

  fn signature(&self) -> String {
    match self {
      Self::Text { text, .. } => format!("text:{text}"),
      Self::Image { data_url, .. } => format!("image:{data_url}"),
      Self::File { paths, .. } => format!("file:{}", paths.join("\n").to_lowercase()),
    }
  }

  fn is_valid(&self) -> bool {
    !self.id().trim().is_empty()
  }
}

fn start_clipboard_watcher(app: AppHandle, runtime: AppRuntime) {
  thread::spawn(move || loop {
    thread::sleep(Duration::from_millis(650));
    let settings = runtime
      .store
      .lock()
      .map(|store| store.state.settings.clone())
      .unwrap_or_else(|_| default_settings());
    let Ok(snapshot) = read_clipboard_snapshot(&settings) else {
      continue;
    };
    let signature = snapshot.signature.clone();
    let should_record = runtime
      .last_clipboard_signature
      .lock()
      .map(|mut last| {
        if signature.is_empty() || *last == signature {
          return false;
        }
        *last = signature;
        true
      })
      .unwrap_or(false);
    if !should_record {
      continue;
    }
    let recorded = runtime
      .store
      .lock()
      .map(|mut store| store.record_snapshot(snapshot).ok().flatten().is_some())
      .unwrap_or(false);
    if recorded {
      broadcast_state(&app, &runtime);
    }
  });
}

fn show_panel(app: &AppHandle, runtime: &AppRuntime) -> anyhow::Result<()> {
  if let Ok(target) = capture_paste_target() {
    if let Ok(mut paste_target) = runtime.paste_target.lock() {
      *paste_target = Some(target);
    }
  }
  let Some(window) = app.get_webview_window("main") else {
    return Ok(());
  };
  window.show()?;
  window.set_focus()?;
  broadcast_state(app, runtime);
  Ok(())
}

fn hide_panel_impl(app: &AppHandle) -> tauri::Result<()> {
  if let Some(window) = app.get_webview_window("main") {
    window.hide()?;
  }
  Ok(())
}

fn broadcast_state(app: &AppHandle, runtime: &AppRuntime) {
  if let Ok(store) = runtime.store.lock() {
    let _ = app.emit("state-changed", store.state_snapshot());
  }
}

fn write_item_to_clipboard(item: &ClipboardItem, settings: &AppSettings) -> anyhow::Result<String> {
  let mut clipboard = Clipboard::new()?;
  match item {
    ClipboardItem::Text { text, .. } => {
      clipboard.set_text(text.clone())?;
      Ok(create_text_snapshot_signature(text, settings))
    }
    ClipboardItem::Image { data_url, .. } => {
      clipboard.set_image(decode_png_data_url(data_url)?)?;
      Ok(create_item_snapshot_signature(item, settings))
    }
    ClipboardItem::File { paths, .. } => {
      if write_file_drop_list(paths).is_ok() {
        return Ok(create_file_snapshot_signature(paths, "", settings));
      }

      let text = paths.join("\r\n");
      clipboard.set_text(text.clone())?;
      Ok(create_file_snapshot_signature(paths, &text, settings))
    }
  }
}

fn read_clipboard_snapshot(settings: &AppSettings) -> anyhow::Result<ClipboardSnapshot> {
  let mut clipboard = Clipboard::new()?;
  let text = clipboard.get_text().unwrap_or_default();
  let files = if settings.capture_files {
    read_clipboard_files(&text)
  } else {
    Vec::new()
  };
  let image = if settings.capture_images {
    read_clipboard_image(&mut clipboard).ok().flatten()
  } else {
    None
  };
  let signature = create_snapshot_signature(&text, &files, image.as_ref());

  Ok(ClipboardSnapshot {
    signature,
    text,
    image,
    files,
  })
}

fn read_clipboard_image(clipboard: &mut Clipboard) -> anyhow::Result<Option<ClipboardImageSnapshot>> {
  let image = match clipboard.get_image() {
    Ok(image) => image,
    Err(_) => return Ok(None),
  };
  let png_bytes = encode_rgba_png(image.width as u32, image.height as u32, image.bytes.as_ref())?;
  let data_url = format!(
    "data:image/png;base64,{}",
    base64::engine::general_purpose::STANDARD.encode(&png_bytes)
  );
  Ok(Some(ClipboardImageSnapshot {
    data_url,
    width: image.width as u32,
    height: image.height as u32,
    byte_size: png_bytes.len(),
  }))
}

fn read_clipboard_files(text_fallback: &str) -> Vec<String> {
  let mut paths = read_file_paths_from_text(text_fallback);
  paths.extend(read_file_drop_list());
  normalize_file_paths(paths)
}

fn read_file_paths_from_text(text: &str) -> Vec<String> {
  text
    .lines()
    .filter_map(|line| normalize_clipboard_path(line.trim()))
    .collect()
}

fn read_file_drop_list() -> Vec<String> {
  let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
  [System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [string]$_ }
}
"#;
  run_powershell(script)
    .map(|output| output.lines().filter_map(normalize_clipboard_path).collect())
    .unwrap_or_default()
}

fn write_file_drop_list(paths: &[String]) -> anyhow::Result<()> {
  if paths.is_empty() {
    anyhow::bail!("文件列表为空");
  }

  let encoded_paths = base64::engine::general_purpose::STANDARD.encode(serde_json::to_string(paths)?.as_bytes());
  let script = format!(
    r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded_paths}'))
$paths = $json | ConvertFrom-Json
$collection = New-Object System.Collections.Specialized.StringCollection
foreach ($path in $paths) {{ [void]$collection.Add([string]$path) }}
[System.Windows.Forms.Clipboard]::SetFileDropList($collection)
"#
  );
  run_powershell(&script).map(|_| ())
}

fn encode_rgba_png(width: u32, height: u32, rgba: &[u8]) -> anyhow::Result<Vec<u8>> {
  let expected_len = width as usize * height as usize * 4;
  if rgba.len() != expected_len {
    anyhow::bail!("图片数据尺寸不匹配");
  }

  let mut encoded = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut encoded, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(rgba)?;
  }
  Ok(encoded)
}

fn decode_png_data_url(data_url: &str) -> anyhow::Result<ImageData<'static>> {
  let encoded = data_url
    .strip_prefix("data:image/png;base64,")
    .ok_or_else(|| anyhow::anyhow!("图片历史格式不正确"))?;
  let png_bytes = base64::engine::general_purpose::STANDARD.decode(encoded)?;
  let decoder = png::Decoder::new(Cursor::new(png_bytes));
  let mut reader = decoder.read_info()?;
  let mut buffer = vec![0; reader.output_buffer_size()];
  let info = reader.next_frame(&mut buffer)?;
  let frame = &buffer[..info.buffer_size()];
  let rgba = convert_png_frame_to_rgba(frame, info.color_type, info.bit_depth)?;

  Ok(ImageData {
    width: info.width as usize,
    height: info.height as usize,
    bytes: Cow::Owned(rgba),
  })
}

fn convert_png_frame_to_rgba(frame: &[u8], color_type: png::ColorType, bit_depth: png::BitDepth) -> anyhow::Result<Vec<u8>> {
  if bit_depth != png::BitDepth::Eight {
    anyhow::bail!("暂不支持非 8-bit PNG 图片写回");
  }

  let rgba = match color_type {
    png::ColorType::Rgba => frame.to_vec(),
    png::ColorType::Rgb => frame.chunks_exact(3).flat_map(|chunk| [chunk[0], chunk[1], chunk[2], 255]).collect(),
    png::ColorType::Grayscale => frame.iter().flat_map(|value| [*value, *value, *value, 255]).collect(),
    png::ColorType::GrayscaleAlpha => frame.chunks_exact(2).flat_map(|chunk| [chunk[0], chunk[0], chunk[0], chunk[1]]).collect(),
    png::ColorType::Indexed => anyhow::bail!("暂不支持调色板 PNG 图片写回"),
  };
  Ok(rgba)
}

fn capture_paste_target() -> anyhow::Result<String> {
  #[cfg(windows)]
  {
    // This runs on the shortcut hot path. Direct User32 calls avoid paying the
    // multi-second PowerShell startup cost before the panel can be shown.
    let foreground_window = unsafe { GetForegroundWindow() };
    if foreground_window.is_null() {
      anyhow::bail!("未找到前台窗口");
    }

    let mut process_id = 0;
    let thread_id = unsafe { GetWindowThreadProcessId(foreground_window, &mut process_id) };
    let mut info = GuiThreadInfo {
      size: std::mem::size_of::<GuiThreadInfo>() as u32,
      flags: 0,
      active_window: std::ptr::null_mut(),
      focused_window: std::ptr::null_mut(),
      capture_window: std::ptr::null_mut(),
      menu_owner_window: std::ptr::null_mut(),
      move_size_window: std::ptr::null_mut(),
      caret_window: std::ptr::null_mut(),
      caret_rect: NativeRect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
    };
    if thread_id != 0 {
      let _ = unsafe { GetGUIThreadInfo(thread_id, &mut info) };
    }

    return Ok(format!(
      "{};{}",
      foreground_window as isize, info.focused_window as isize
    ));
  }

  #[cfg(not(windows))]
  anyhow::bail!("仅 Windows 支持目标窗口捕获")
}

fn paste_to_target(target: &str) -> anyhow::Result<()> {
  let encoded_target = base64::engine::general_purpose::STANDARD.encode(target.as_bytes());
  let script = format!(
    r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$targetSpec = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded_target}'))
Add-Type -Namespace LightClip -Name NativeMethods -MemberDefinition @'
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
function Convert-Handle([string] $value) {{
  [int64]$handleValue = 0
  if (-not [Int64]::TryParse($value, [ref]$handleValue) -or $handleValue -le 0) {{ return [IntPtr]::Zero }}
  return [IntPtr]$handleValue
}}
function Get-ThreadId([IntPtr] $handle) {{
  [uint32]$processId = 0
  [LightClip.NativeMethods]::GetWindowThreadProcessId($handle, [ref]$processId)
}}
$parts = $targetSpec -split ';', 2
$windowHandle = Convert-Handle $parts[0]
$focusedWindow = if ($parts.Length -gt 1) {{ Convert-Handle $parts[1] }} else {{ [IntPtr]::Zero }}
if ($windowHandle -ne [IntPtr]::Zero -and [LightClip.NativeMethods]::IsWindow($windowHandle)) {{
  $currentThreadId = [LightClip.NativeMethods]::GetCurrentThreadId()
  $targetThreadId = Get-ThreadId $windowHandle
  $foregroundThreadId = Get-ThreadId ([LightClip.NativeMethods]::GetForegroundWindow())
  $attachedTarget = $false
  $attachedForeground = $false
  try {{
    if ($targetThreadId -ne 0 -and $targetThreadId -ne $currentThreadId) {{
      $attachedTarget = [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $targetThreadId, $true)
    }}
    if ($foregroundThreadId -ne 0 -and $foregroundThreadId -ne $currentThreadId -and $foregroundThreadId -ne $targetThreadId) {{
      $attachedForeground = [LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $foregroundThreadId, $true)
    }}
    if ([LightClip.NativeMethods]::IsIconic($windowHandle)) {{
      [void][LightClip.NativeMethods]::ShowWindowAsync($windowHandle, 9)
      Start-Sleep -Milliseconds 40
    }}
    if (-not [LightClip.NativeMethods]::SetForegroundWindow($windowHandle)) {{
      [void][LightClip.NativeMethods]::BringWindowToTop($windowHandle)
      [void][LightClip.NativeMethods]::SetForegroundWindow($windowHandle)
    }}
    if ($focusedWindow -ne [IntPtr]::Zero -and [LightClip.NativeMethods]::IsWindow($focusedWindow)) {{
      [void][LightClip.NativeMethods]::SetFocus($focusedWindow)
    }}
  }} finally {{
    if ($attachedForeground) {{ [void][LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $foregroundThreadId, $false) }}
    if ($attachedTarget) {{ [void][LightClip.NativeMethods]::AttachThreadInput($currentThreadId, $targetThreadId, $false) }}
  }}
}}
Start-Sleep -Milliseconds 120
[System.Windows.Forms.SendKeys]::SendWait('^v')
"#
  );
  run_powershell(&script).map(|_| ())
}

fn run_powershell(script: &str) -> anyhow::Result<String> {
  let mut command = Command::new("powershell.exe");
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
  }
  let output = command
    .args(["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script])
    .output()?;
  if !output.status.success() {
    anyhow::bail!(String::from_utf8_lossy(&output.stderr).trim().to_string());
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_compressed_store_file(path: &Path) -> anyhow::Result<PersistedStore> {
  let payload = fs::read(path)?;
  let raw = decompress_store_payload(&payload)?;
  parse_persisted_store(&raw)
}

fn compress_store_payload(payload: &str) -> anyhow::Result<Vec<u8>> {
  let mut encoded = Vec::new();
  {
    let mut writer = brotli::CompressorWriter::new(&mut encoded, 4096, 11, 22);
    writer.write_all(payload.as_bytes())?;
  }
  Ok(encoded)
}

fn decompress_store_payload(payload: &[u8]) -> anyhow::Result<String> {
  let mut decoded = Vec::new();
  let mut reader = brotli::Decompressor::new(payload, 4096);
  reader.read_to_end(&mut decoded)?;
  Ok(String::from_utf8(decoded)?)
}

fn parse_persisted_store(raw: &str) -> anyhow::Result<PersistedStore> {
  let parsed: RawPersistedStore = serde_json::from_str(raw)?;
  Ok(PersistedStore {
    version: parsed.version.unwrap_or(STORE_VERSION),
    settings: normalize_settings(parsed.settings.unwrap_or_default()),
    items: normalize_clipboard_items(parsed.items.unwrap_or_default()),
  })
}

fn normalize_clipboard_items(values: Vec<serde_json::Value>) -> Vec<ClipboardItem> {
  values.into_iter().filter_map(normalize_clipboard_item).collect()
}

fn normalize_clipboard_item(value: serde_json::Value) -> Option<ClipboardItem> {
  let object = value.as_object()?;
  let now = now_ms();
  let id = object
    .get("id")
    .and_then(serde_json::Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .unwrap_or_else(create_item_id);
  let pinned = object.get("pinned").and_then(serde_json::Value::as_bool).unwrap_or(false);
  let copy_count = json_u64(object_field(object, "copyCount", "copy_count")).min(u32::MAX as u64) as u32;
  let created_at = normalize_timestamp(object_field(object, "createdAt", "created_at"), now);
  let updated_at = normalize_timestamp(object_field(object, "updatedAt", "updated_at"), now);
  let kind = object.get("kind").and_then(serde_json::Value::as_str).unwrap_or("text");

  match kind {
    // Early LightClip stores had no `kind`; a text payload identifies those records.
    "text" => {
      let text = normalize_clipboard_text(object.get("text")?.as_str()?);
      (!text.is_empty()).then_some(ClipboardItem::Text {
        id,
        pinned,
        copy_count,
        created_at,
        updated_at,
        text,
      })
    }
    "image" => {
      let data_url = object_field(object, "dataUrl", "data_url")?.as_str()?.to_string();
      if !data_url.starts_with("data:image/png;base64,") {
        return None;
      }
      Some(ClipboardItem::Image {
        id,
        pinned,
        copy_count,
        created_at,
        updated_at,
        data_url,
        width: json_u64(object.get("width")).clamp(1, 100_000) as u32,
        height: json_u64(object.get("height")).clamp(1, 100_000) as u32,
        byte_size: json_u64(object_field(object, "byteSize", "byte_size")).clamp(1, 100 * 1024 * 1024) as usize,
      })
    }
    "file" => {
      let paths = object
        .get("paths")?
        .as_array()?
        .iter()
        .filter_map(serde_json::Value::as_str)
        .map(str::to_string)
        .collect();
      let paths = normalize_file_paths(paths);
      (!paths.is_empty()).then_some(ClipboardItem::File {
        id,
        pinned,
        copy_count,
        created_at,
        updated_at,
        paths,
      })
    }
    _ => None,
  }
}

fn object_field<'a>(
  object: &'a serde_json::Map<String, serde_json::Value>,
  camel_case: &str,
  snake_case: &str,
) -> Option<&'a serde_json::Value> {
  object.get(camel_case).or_else(|| object.get(snake_case))
}

fn json_u64(value: Option<&serde_json::Value>) -> u64 {
  value
    .and_then(|value| value.as_u64().or_else(|| value.as_f64().map(|number| number.max(0.0) as u64)))
    .unwrap_or(0)
}

fn normalize_timestamp(value: Option<&serde_json::Value>, fallback: i64) -> i64 {
  let timestamp = value
    .and_then(|value| value.as_i64().or_else(|| value.as_f64().map(|number| number.round() as i64)))
    .unwrap_or(fallback);
  if timestamp > 0 { timestamp } else { fallback }
}

fn normalize_file_paths(paths: Vec<String>) -> Vec<String> {
  let mut seen = HashSet::new();
  paths
    .into_iter()
    .map(|path| path.trim().trim_matches('"').to_string())
    .filter(|path| !path.is_empty() && seen.insert(path.to_lowercase()))
    .collect()
}

fn normalize_clipboard_path(value: &str) -> Option<String> {
  let path = value.trim().trim_matches('"');
  if path.is_empty() {
    return None;
  }
  let candidate = PathBuf::from(path);
  (candidate.is_absolute() && candidate.exists()).then(|| candidate.to_string_lossy().to_string())
}

fn create_file_signature(paths: &[String]) -> String {
  paths.iter().map(|path| path.to_lowercase()).collect::<Vec<_>>().join("\n")
}

fn create_snapshot_signature(
  text: &str,
  files: &[String],
  image: Option<&ClipboardImageSnapshot>,
) -> String {
  if !files.is_empty() {
    return format!("file:{}", create_file_signature(files));
  }
  if let Some(image) = image {
    return format!("image:{}", image.data_url);
  }
  let normalized = normalize_clipboard_text(text);
  if normalized.is_empty() { String::new() } else { format!("text:{normalized}") }
}

fn create_text_snapshot_signature(text: &str, _settings: &AppSettings) -> String {
  create_snapshot_signature(text, &[], None)
}

fn create_file_snapshot_signature(paths: &[String], text: &str, _settings: &AppSettings) -> String {
  create_snapshot_signature(text, paths, None)
}

fn create_item_snapshot_signature(item: &ClipboardItem, _settings: &AppSettings) -> String {
  item.signature()
}

fn write_atomic(path: &Path, payload: &[u8]) -> anyhow::Result<()> {
  let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or(STORE_FILE_NAME);
  let temporary_path = path.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4().simple()));
  let result = (|| -> anyhow::Result<()> {
    let mut file = fs::File::create(&temporary_path)?;
    file.write_all(payload)?;
    file.sync_all()?;

    // std::fs::rename cannot replace an existing destination on Windows. A readable
    // backup is already written before this short replacement window.
    if path.exists() {
      fs::remove_file(path)?;
    }
    fs::rename(&temporary_path, path)?;
    Ok(())
  })();
  if result.is_err() {
    let _ = fs::remove_file(&temporary_path);
  }
  result
}

fn default_storage_directory() -> PathBuf {
  let base_directory = dirs::data_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
  let stable_directory = base_directory.join(APP_DATA_DIRECTORY_NAME);
  let legacy_tauri_directory = base_directory.join(LEGACY_TAURI_DATA_DIRECTORY_NAME);
  if !stable_directory.exists() && legacy_tauri_directory.exists() {
    return legacy_tauri_directory;
  }

  stable_directory
}

fn default_settings() -> AppSettings {
  AppSettings {
    capture_enabled: true,
    capture_paused_until: None,
    launch_at_login: false,
    max_history_items: 300,
    min_text_length: 1,
    max_text_length: 20_000,
    capture_images: false,
    capture_files: false,
    encrypt_store: false,
    excluded_app_names: Vec::new(),
    paste_after_copy: false,
    max_image_bytes: 5 * 1024 * 1024,
    max_file_paths: 20,
    retention_days: 0,
    global_shortcut: "Alt+V".to_string(),
    theme_accent: "mint".to_string(),
    theme_mode: "system".to_string(),
  }
}

impl Default for AppSettings {
  fn default() -> Self {
    default_settings()
  }
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
  settings.capture_paused_until = normalize_pause_until(settings.capture_paused_until);
  settings.max_history_items = settings.max_history_items.clamp(20, 3000);
  settings.min_text_length = settings.min_text_length.clamp(1, 2000);
  settings.max_text_length = settings.max_text_length.clamp(100, 200_000);
  settings.max_image_bytes = settings.max_image_bytes.clamp(128 * 1024, 100 * 1024 * 1024);
  settings.max_file_paths = settings.max_file_paths.clamp(1, 200);
  settings.retention_days = settings.retention_days.clamp(0, 3650);
  settings.encrypt_store = false;
  settings.excluded_app_names = normalize_excluded_app_names(settings.excluded_app_names);
  settings.global_shortcut = settings.global_shortcut.trim().to_string();
  if settings.global_shortcut.trim().is_empty() {
    settings.global_shortcut = "Alt+V".to_string();
  }
  if !["mint", "blue", "violet", "rose", "amber"].contains(&settings.theme_accent.as_str()) {
    settings.theme_accent = "mint".to_string();
  }
  if !["system", "light", "dark"].contains(&settings.theme_mode.as_str()) {
    settings.theme_mode = "system".to_string();
  }
  settings
}

fn normalize_pause_until(value: Option<i64>) -> Option<i64> {
  let timestamp = value?;
  let now = now_ms();
  if timestamp <= now {
    return None;
  }
  Some(timestamp.min(now + MAX_TEMPORARY_PAUSE_MS))
}

fn normalize_excluded_app_names(values: Vec<String>) -> Vec<String> {
  let mut seen = HashSet::new();
  values
    .into_iter()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty() && seen.insert(normalize_process_name(value)))
    .take(100)
    .collect()
}

fn normalize_clipboard_text(text: &str) -> String {
  text.replace('\0', "").trim().to_string()
}

fn create_item_id() -> String {
  format!("{}-{}", now_ms(), Uuid::new_v4().simple())
}

fn now_ms() -> i64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

fn now_rfc3339() -> String {
  time::OffsetDateTime::now_utc()
    .format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn is_capture_temporarily_paused(value: Option<i64>) -> bool {
  value.map_or(false, |timestamp| timestamp > now_ms())
}

fn is_missing_store(error: &anyhow::Error) -> bool {
  error.to_string().contains("missing store")
}

fn apply_launch_at_login(enabled: bool) {
  let Ok(exe) = std::env::current_exe() else {
    return;
  };
  let entry = format!("\"{}\" --hidden", exe.to_string_lossy());
  let args = if enabled {
    vec![
      "add".to_string(),
      r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run".to_string(),
      "/v".to_string(),
      "LightClip".to_string(),
      "/t".to_string(),
      "REG_SZ".to_string(),
      "/d".to_string(),
      entry,
      "/f".to_string(),
    ]
  } else {
    vec![
      "delete".to_string(),
      r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run".to_string(),
      "/v".to_string(),
      "LightClip".to_string(),
      "/f".to_string(),
    ]
  };
  let _ = run_hidden_command("reg.exe", &args);
}

fn fetch_latest_release() -> anyhow::Result<(String, String)> {
  let script = format!(
    r#"
$ErrorActionPreference = 'Stop'
$headers = @{{ 'User-Agent' = 'LightClip' }}
$release = Invoke-RestMethod -UseBasicParsing -Headers $headers -Uri '{RELEASE_API_URL}'
$release | Select-Object tag_name, html_url | ConvertTo-Json -Compress
"#
  );
  let response: serde_json::Value = serde_json::from_str(&run_powershell(&script)?)?;
  let tag = response
    .get("tag_name")
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .trim_start_matches('v')
    .to_string();
  let url = response
    .get("html_url")
    .and_then(|value| value.as_str())
    .unwrap_or(RELEASE_URL_PREFIX)
    .to_string();
  if tag.is_empty() {
    anyhow::bail!("未找到可用的最新版本号");
  }
  Ok((tag, url))
}

fn compare_semver(left: &str, right: &str) -> i32 {
  let parse = |value: &str| {
    value
      .split('.')
      .map(|part| part.parse::<i32>().unwrap_or(0))
      .collect::<Vec<_>>()
  };
  let left_parts = parse(left);
  let right_parts = parse(right);
  for index in 0..3 {
    let left_value = *left_parts.get(index).unwrap_or(&0);
    let right_value = *right_parts.get(index).unwrap_or(&0);
    if left_value != right_value {
      return if left_value > right_value { 1 } else { -1 };
    }
  }
  0
}

fn normalize_process_name(value: &str) -> String {
  value.trim().trim_end_matches(".exe").to_lowercase()
}

fn read_foreground_process_name() -> Option<String> {
  let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -Namespace LightClip -Name ForegroundProcess -MemberDefinition @'
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
'@
$window = [LightClip.ForegroundProcess]::GetForegroundWindow()
[uint32]$processId = 0
[void][LightClip.ForegroundProcess]::GetWindowThreadProcessId($window, [ref]$processId)
if ($processId -gt 0) { (Get-Process -Id $processId).ProcessName }
"#;
  run_powershell(script).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

fn run_hidden_command(program: &str, args: &[String]) -> anyhow::Result<String> {
  let mut command = Command::new(program);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
  }
  let output = command.args(args).output()?;
  if !output.status.success() {
    anyhow::bail!(String::from_utf8_lossy(&output.stderr).trim().to_string());
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn ok<T: Serialize>(data: T) -> CommandResult<T> {
  CommandResult {
    ok: true,
    data: Some(data),
    error: None,
  }
}

fn ok_unit() -> CommandResult<()> {
  CommandResult {
    ok: true,
    data: None,
    error: None,
  }
}

fn err<T: Serialize>(message: impl Into<String>) -> CommandResult<T> {
  CommandResult {
    ok: false,
    data: None,
    error: Some(message.into()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn clipboard_items_serialize_with_renderer_field_names() {
    let item = ClipboardItem::Text {
      id: "item-1".to_string(),
      pinned: false,
      copy_count: 2,
      created_at: 100,
      updated_at: 200,
      text: "hello".to_string(),
    };

    let serialized = serde_json::to_value(item).expect("clipboard item should serialize");
    assert_eq!(serialized["copyCount"], 2);
    assert_eq!(serialized["createdAt"], 100);
    assert_eq!(serialized["updatedAt"], 200);
    assert!(serialized.get("copy_count").is_none());
  }

  #[test]
  fn persisted_snake_case_items_are_migrated_without_losing_metadata() {
    let item = normalize_clipboard_item(serde_json::json!({
      "kind": "text",
      "id": "legacy-item",
      "pinned": true,
      "copy_count": 3,
      "created_at": 1_000,
      "updated_at": 2_000,
      "text": "legacy"
    }))
    .expect("legacy item should normalize");

    let serialized = serde_json::to_value(item).expect("normalized item should serialize");
    assert_eq!(serialized["copyCount"], 3);
    assert_eq!(serialized["createdAt"], 1_000);
    assert_eq!(serialized["updatedAt"], 2_000);
  }

  #[cfg(windows)]
  #[test]
  fn paste_target_capture_stays_on_the_shortcut_fast_path() {
    let started_at = std::time::Instant::now();
    let _ = capture_paste_target();
    assert!(started_at.elapsed() < Duration::from_millis(250));
  }
}
