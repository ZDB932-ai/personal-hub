use std::{collections::BTreeMap, sync::Mutex, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewWindow, WindowEvent};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
  enabled: bool,
  pinned: bool,
  collapsed: bool,
  snap: bool,
  x: Option<i32>,
  y: Option<i32>,
  width: f64,
  height: f64,
}
impl Default for Preferences {
  fn default() -> Self { Self { enabled: false, pinned: false, collapsed: false, snap: true, x: None, y: None, width: 360.0, height: 480.0 } }
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PreferencePatch { enabled: Option<bool>, pinned: Option<bool>, collapsed: Option<bool>, snap: Option<bool> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Item {
  id: String, title: String, date: String, time: String, done: bool,
  #[serde(skip_serializing_if = "Option::is_none")] priority: Option<u8>,
  #[serde(skip_serializing_if = "Option::is_none")] focus: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")] subtasks: Option<Vec<Subtask>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Subtask { id: String, title: String, done: bool }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Theme { mode: String, accent: String, style: String }
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase { #[default] Unavailable, Ready, Locking, Locked, Error, Exiting }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct View {
  phase: Phase, epoch: String, revision: u64, items: Vec<Item>, captured_at: u64,
  source: String, label: String, saving: bool, error: String, theme: Theme,
}
impl Default for View {
  fn default() -> Self {
    Self { phase: Phase::Unavailable, epoch: String::new(), revision: 0, items: vec![], captured_at: 0, source: "today".into(), label: "今天".into(), saving: false, error: String::new(), theme: Theme { mode: "light".into(), accent: "teal".into(), style: "classic".into() } }
  }
}
impl View {
  fn sanitize(&mut self) -> Result<(), String> {
    if self.items.len() > 10000 || self.items.iter().any(|item| item.title.len() > 30000 || item.id.len() > 200) { return Err("清单过大".into()); }
    if self.phase == Phase::Locked {
      for item in &mut self.items { item.priority = None; item.focus = None; item.subtasks = None; }
      self.source = "today".into(); self.label = "锁定时快照".into(); self.error.clear(); self.saving = false;
    } else if self.phase != Phase::Ready { self.items.clear(); }
    Ok(())
  }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Request {
  id: String, epoch: String, revision: u64, action: String,
  task_id: Option<String>, subtask_id: Option<String>, value: Option<bool>, text: Option<String>, direction: Option<i32>, target_id: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct Receipt { id: String, status: String, error: String }
#[derive(Clone, Serialize)]
pub struct Snapshot { preferences: Preferences, view: View, receipts: Vec<Receipt> }
pub struct Inner {
  preferences: Preferences, view: View, owner: String, seen: Instant, dirty: Option<Instant>,
  requests: BTreeMap<String, Request>, receipts: BTreeMap<String, Receipt>, activity: bool, navigation: Option<String>, quit: bool,
}
impl Default for Inner {
  fn default() -> Self { Self { preferences: Preferences::default(), view: View::default(), owner: String::new(), seen: Instant::now(), dirty: None, requests: BTreeMap::new(), receipts: BTreeMap::new(), activity: false, navigation: None, quit: false } }
}
#[derive(Default)]
pub struct TodoState(Mutex<Inner>);
fn caller(window: &WebviewWindow, labels: &[&str]) -> Result<(), String> {
  if labels.contains(&window.label()) { Ok(()) } else { Err("此窗口无权操作桌面清单".into()) }
}
fn owner_check(inner: &Inner, owner: &str) -> Result<(), String> {
  if !owner.is_empty() && inner.owner == owner { Ok(()) } else { Err("主会话已变更".into()) }
}
fn changed(app: &tauri::AppHandle) { let _ = app.emit_to("todo", "todo://changed", ()); let _ = app.emit_to("main", "todo://changed", ()); }
fn wake(app: &tauri::AppHandle) { let _ = app.emit_to("main", "todo://wake", ()); }
fn save_preferences(app: &tauri::AppHandle, preferences: &Preferences) -> Result<(), String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let bytes = serde_json::to_vec(preferences).map_err(|e| e.to_string())?;
  let temporary = dir.join("desktop-todo.tmp");
  std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
  std::fs::rename(temporary, dir.join("desktop-todo.json")).map_err(|e| e.to_string())
}
fn apply_window(app: &tauri::AppHandle, preferences: &Preferences) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("todo") {
    window.set_always_on_top(preferences.pinned).map_err(|e| e.to_string())?;
    window.set_min_size(Some(tauri::LogicalSize::new(300.0, if preferences.collapsed { 56.0 } else { 240.0 }))).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(preferences.width.clamp(300.0, 900.0), if preferences.collapsed { 56.0 } else { preferences.height.clamp(240.0, 1400.0) })).map_err(|e| e.to_string())?;
    window.set_resizable(!preferences.collapsed).map_err(|e| e.to_string())?;
    if preferences.enabled { window.show().map_err(|e| e.to_string())?; } else { window.hide().map_err(|e| e.to_string())?; }
  }
  Ok(())
}
fn clamp_axis(value: i32, start: i32, space: u32, size: u32, snap: bool, margin: i32) -> i32 {
  let end = (start as i64 + space.saturating_sub(size) as i64).clamp(i32::MIN as i64, i32::MAX as i64) as i32;
  let value = value.clamp(start, end.max(start));
  if snap && value.saturating_sub(start) <= margin { start }
  else if snap && end.saturating_sub(value) <= margin { end }
  else { value }
}
fn place(app: &tauri::AppHandle, reset: bool) -> Result<(), String> {
  let Some(window) = app.get_webview_window("todo") else { return Ok(()); };
  let position = window.outer_position().map_err(|e| e.to_string())?;
  let monitors = window.available_monitors().map_err(|e| e.to_string())?;
  let monitor = if reset { window.primary_monitor().map_err(|e| e.to_string())? }
    else { monitors.iter().find(|monitor| {
      let area = monitor.work_area(); position.x as i64 >= area.position.x as i64 && (position.x as i64) < area.position.x as i64 + area.size.width as i64 && position.y as i64 >= area.position.y as i64 && (position.y as i64) < area.position.y as i64 + area.size.height as i64
    }).cloned().or(window.primary_monitor().map_err(|e| e.to_string())?) };
  if let Some(monitor) = monitor {
    let area = monitor.work_area(); let scale = monitor.scale_factor();
    let mut size = window.outer_size().map_err(|e| e.to_string())?;
    if size.width > area.size.width || size.height > area.size.height {
      size.width = size.width.min(area.size.width); size.height = size.height.min(area.size.height);
      window.set_size(size).map_err(|e| e.to_string())?;
    }
    let snap = app.state::<TodoState>().0.lock().unwrap().preferences.snap;
    let x = if reset { area.position.x.saturating_add(((area.size.width.saturating_sub(size.width)) / 2) as i32) } else { position.x };
    let y = if reset { area.position.y.saturating_add((24.0 * scale) as i32) } else { position.y };
    let target = tauri::PhysicalPosition::new(clamp_axis(x, area.position.x, area.size.width, size.width, snap, (12.0 * scale) as i32), clamp_axis(y, area.position.y, area.size.height, size.height, snap, (12.0 * scale) as i32));
    if target != position { window.set_position(target).map_err(|e| e.to_string())?; }
  }
  Ok(())
}
fn capture_layout(app: &tauri::AppHandle) -> Result<(), String> {
  let Some(window) = app.get_webview_window("todo") else { return Ok(()); };
  let pos = window.outer_position().map_err(|e| e.to_string())?;
  let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
  let mut next = inner.preferences.clone(); next.x = Some(pos.x); next.y = Some(pos.y); next.width = size.width;
  if !next.collapsed { next.height = size.height; }
  save_preferences(app, &next)?; inner.preferences = next; inner.dirty = None;
  Ok(())
}
pub fn set_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
  configure(app, PreferencePatch { enabled: Some(enabled), ..Default::default() })
}
fn configure(app: &tauri::AppHandle, patch: PreferencePatch) -> Result<(), String> {
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
  let old = inner.preferences.clone(); let mut next = old.clone();
  if let Some(value) = patch.enabled { next.enabled = value; }
  if let Some(value) = patch.pinned { next.pinned = value; }
  if let Some(value) = patch.collapsed { next.collapsed = value; }
  if let Some(value) = patch.snap { next.snap = value; }
  save_preferences(app, &next)?;
  inner.preferences = next.clone(); drop(inner);
  if let Err(error) = apply_window(app, &next) {
    let _ = save_preferences(app, &old); state.0.lock().unwrap().preferences = old.clone(); let _ = apply_window(app, &old);
    return Err(error);
  }
  place(app, false)?; changed(app); wake(app); Ok(())
}
pub fn reset_position(app: &tauri::AppHandle) -> Result<(), String> { place(app, true)?; capture_layout(app) }
pub fn request_quit(app: &tauri::AppHandle) {
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
  if inner.owner.is_empty() { drop(inner); app.exit(0); return; }
  inner.quit = true; inner.view.phase = Phase::Exiting; inner.view.items.clear(); drop(inner);
  changed(app); wake(app);
}
pub fn window_event(window: &tauri::Window, event: &WindowEvent) {
  if window.label() != "todo" { return; }
  let app = window.app_handle();
  if let WindowEvent::CloseRequested { api, .. } = event {
    api.prevent_close();
    if let Err(error) = set_enabled(app, false) { log::warn!("关闭桌面清单失败: {error}"); }
  }
  if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
    app.state::<TodoState>().0.lock().unwrap().dirty = Some(Instant::now());
  }
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let mut preferences = app.path().app_config_dir().ok().and_then(|dir| std::fs::read(dir.join("desktop-todo.json")).ok()).and_then(|bytes| serde_json::from_slice::<Preferences>(&bytes).ok()).unwrap_or_default();
  if !preferences.width.is_finite() { preferences.width = 360.0; }
  if !preferences.height.is_finite() { preferences.height = 480.0; }
  app.state::<TodoState>().0.lock().unwrap().preferences = preferences.clone();
  tauri::WebviewWindowBuilder::new(app, "todo", tauri::WebviewUrl::App("index.html?todo=1".into()))
    .title("Personal Hub · 桌面 Todo").inner_size(360.0, 480.0).min_inner_size(300.0, 240.0)
    .decorations(false).resizable(true).skip_taskbar(true).focused(false).visible(false).disable_drag_drop_handler().build()?;
  if let (Some(x), Some(y)) = (preferences.x, preferences.y) { app.get_webview_window("todo").unwrap().set_position(tauri::PhysicalPosition::new(x, y))?; }
  apply_window(app, &preferences)?; place(app, preferences.x.is_none())?;
  let handle = app.clone();
  std::thread::spawn(move || {
    let mut monitors = String::new();
    loop {
    std::thread::sleep(Duration::from_secs(2));
    let state = handle.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
    let expired = !inner.owner.is_empty() && inner.seen.elapsed() > Duration::from_secs(15) && inner.view.phase != Phase::Locked;
    if expired { inner.view = View::default(); inner.requests.clear(); inner.receipts.clear(); }
    let mut save = inner.dirty.is_some_and(|time| time.elapsed() > Duration::from_millis(300));
    let enabled = inner.preferences.enabled;
    drop(inner);
    if enabled {
      if let Some(window) = handle.get_webview_window("todo") {
        if let Ok(current) = window.available_monitors() {
          let fingerprint = format!("{:?}", current.iter().map(|m| (m.position(), m.size(), m.scale_factor())).collect::<Vec<_>>());
          if monitors != fingerprint { monitors = fingerprint; save = true; }
        }
      }
    }
    if expired { changed(&handle); }
    if save { let _ = place(&handle, false); if let Err(error) = capture_layout(&handle) { log::warn!("保存清单布局失败: {error}"); } }
    wake(&handle);
    }
  });
  Ok(())
}
#[tauri::command]
pub fn todo_connect(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<(), String> {
  caller(&window, &["main"])?;
  if owner.is_empty() || owner.len() > 100 { return Err("无效会话".into()); }
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
  inner.owner = owner; inner.seen = Instant::now(); inner.view = View::default(); inner.requests.clear(); inner.receipts.clear(); inner.quit = false;
  drop(inner); changed(&app); Ok(())
}
#[tauri::command]
pub fn todo_publish(window: WebviewWindow, app: tauri::AppHandle, owner: String, mut view: View) -> Result<(), String> {
  caller(&window, &["main"])?; view.sanitize()?;
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?;
  if view.epoch != inner.view.epoch || view.phase == Phase::Locked || view.phase == Phase::Unavailable { inner.requests.clear(); inner.receipts.clear(); }
  if inner.quit && view.phase == Phase::Ready { return Err("应用正在退出".into()); }
  inner.view = view; inner.seen = Instant::now(); drop(inner); changed(&app); Ok(())
}
#[tauri::command]
pub fn todo_read(window: WebviewWindow, app: tauri::AppHandle) -> Result<Snapshot, String> {
  caller(&window, &["main", "todo"])?;
  let state = app.state::<TodoState>(); let inner = state.0.lock().unwrap();
  Ok(Snapshot { preferences: inner.preferences.clone(), view: inner.view.clone(), receipts: inner.receipts.values().cloned().collect() })
}
#[tauri::command]
pub fn todo_configure(window: WebviewWindow, app: tauri::AppHandle, patch: PreferencePatch) -> Result<(), String> { caller(&window, &["main", "todo"])?; configure(&app, patch) }
#[tauri::command]
pub fn todo_reset_position(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> { caller(&window, &["main", "todo"])?; reset_position(&app) }
#[derive(Serialize)]
pub struct WindowBounds { x: i32, y: i32, width: u32, height: u32, scale: f64 }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowBoundsPatch { x: Option<i32>, y: Option<i32>, width: Option<u32>, height: Option<u32> }
#[tauri::command]
pub fn todo_window_bounds(window: WebviewWindow) -> Result<WindowBounds, String> {
  caller(&window, &["todo"])?;
  let position = window.outer_position().map_err(|e| e.to_string())?;
  let size = window.inner_size().map_err(|e| e.to_string())?;
  Ok(WindowBounds { x: position.x, y: position.y, width: size.width, height: size.height, scale: window.scale_factor().map_err(|e| e.to_string())? })
}
#[tauri::command]
pub fn todo_set_window_bounds(window: WebviewWindow, bounds: WindowBoundsPatch) -> Result<(), String> {
  caller(&window, &["todo"])?;
  match (bounds.x, bounds.y, bounds.width, bounds.height) {
    (Some(x), Some(y), None, None) => window.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string()),
    (None, None, Some(width), Some(height)) => {
      if window.app_handle().state::<TodoState>().0.lock().unwrap().preferences.collapsed { return Err("折叠时不能调整大小".into()); }
      let scale = window.scale_factor().map_err(|e| e.to_string())?;
      window.set_size(tauri::LogicalSize::new((width as f64 / scale).clamp(300.0, 900.0), (height as f64 / scale).clamp(240.0, 1400.0))).map_err(|e| e.to_string())
    },
    _ => Err("无效窗口尺寸或位置".into()),
  }
}
fn enqueue(inner: &mut Inner, request: Request) -> Result<Receipt, String> {
  if inner.view.phase != Phase::Ready || inner.quit || request.epoch != inner.view.epoch { return Err("清单已锁定或会话已变化".into()); }
  if let Some(receipt) = inner.receipts.get(&request.id) { return Ok(receipt.clone()); }
  if request.id.is_empty() || request.id.len() > 100 || request.text.as_ref().is_some_and(|v| v.chars().count() > 500) || !["add", "done", "subtask", "move"].contains(&request.action.as_str()) { return Err("无效任务操作".into()); }
  if inner.requests.len() >= 64 || inner.receipts.len() >= 10000 { return Err("待处理操作过多，请重新解锁后继续".into()); }
  let receipt = Receipt { id: request.id.clone(), status: "pending".into(), error: String::new() };
  inner.requests.insert(request.id.clone(), request); inner.receipts.insert(receipt.id.clone(), receipt.clone()); Ok(receipt)
}
#[tauri::command]
pub fn todo_submit(window: WebviewWindow, app: tauri::AppHandle, request: Request) -> Result<Receipt, String> {
  caller(&window, &["todo"])?;
  let result = enqueue(&mut app.state::<TodoState>().0.lock().unwrap(), request)?;
  wake(&app); changed(&app); Ok(result)
}
#[derive(Serialize)]
pub struct Work { requests: Vec<Request>, activity: bool, navigation: Option<String>, quit: bool }
#[tauri::command]
pub fn todo_work(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<Work, String> {
  caller(&window, &["main"])?;
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?; inner.seen = Instant::now();
  Ok(Work { requests: inner.requests.values().cloned().collect(), activity: std::mem::take(&mut inner.activity), navigation: inner.navigation.take(), quit: inner.quit })
}
#[tauri::command]
pub fn todo_resolve(window: WebviewWindow, app: tauri::AppHandle, owner: String, id: String, error: String) -> Result<(), String> {
  caller(&window, &["main"])?;
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?;
  inner.requests.remove(&id);
  if inner.receipts.contains_key(&id) { inner.receipts.insert(id.clone(), Receipt { id, status: if error.is_empty() { "applied" } else { "failed" }.into(), error }); }
  drop(inner); changed(&app); Ok(())
}
#[tauri::command]
pub fn todo_home(window: WebviewWindow, app: tauri::AppHandle, task_id: Option<String>) -> Result<(), String> {
  caller(&window, &["todo", "main"])?;
  let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap();
  let id = task_id.unwrap_or_default();
  if !id.is_empty() && id != "settings" && !inner.view.items.iter().any(|item| item.id == id) { return Err("任务已不在清单中".into()); }
  inner.navigation = Some(id); drop(inner); super::show_main_window(&app); wake(&app); Ok(())
}
#[tauri::command]
pub fn todo_activity(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
  caller(&window, &["todo"])?; app.state::<TodoState>().0.lock().unwrap().activity = true; wake(&app); Ok(())
}
#[tauri::command]
pub fn todo_heartbeat(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<(), String> {
  caller(&window, &["main"])?; let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?; inner.seen = Instant::now(); Ok(())
}
#[tauri::command]
pub fn todo_disconnect(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<(), String> {
  caller(&window, &["main"])?; let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?;
  inner.owner.clear(); inner.view = View::default(); inner.requests.clear(); inner.receipts.clear(); drop(inner); changed(&app); Ok(())
}
#[tauri::command]
pub fn todo_finish_quit(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<(), String> {
  caller(&window, &["main"])?; let state = app.state::<TodoState>(); let inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?;
  if !inner.quit { return Err("未请求退出".into()); } drop(inner); let _ = capture_layout(&app); app.exit(0); Ok(())
}
#[tauri::command]
pub fn todo_cancel_quit(window: WebviewWindow, app: tauri::AppHandle, owner: String) -> Result<(), String> {
  caller(&window, &["main"])?; let state = app.state::<TodoState>(); let mut inner = state.0.lock().unwrap(); owner_check(&inner, &owner)?; inner.quit = false; drop(inner); super::show_main_window(&app); Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  fn request(id: &str) -> Request { Request { id: id.into(), epoch: "session".into(), revision: 1, action: "done".into(), task_id: Some("task".into()), subtask_id: None, value: Some(true), text: None, direction: None, target_id: None } }
  #[test]
  fn locked_rejects_writes_and_old_sessions() {
    let mut state = Inner::default(); state.view.epoch = "session".into();
    assert!(enqueue(&mut state, request("a")).is_err());
    state.view.phase = Phase::Ready; state.view.epoch = "new".into(); assert!(enqueue(&mut state, request("a")).is_err());
  }
  #[test]
  fn duplicate_requests_are_not_executed_twice() {
    let mut state = Inner::default(); state.view.phase = Phase::Ready; state.view.epoch = "session".into();
    enqueue(&mut state, request("a")).unwrap(); enqueue(&mut state, request("a")).unwrap();
    assert_eq!(state.requests.len(), 1);
    state.requests.clear(); state.receipts.get_mut("a").unwrap().status = "applied".into();
    assert_eq!(enqueue(&mut state, request("a")).unwrap().status, "applied"); assert!(state.requests.is_empty());
  }
  #[test]
  fn read_only_projection_cannot_contain_subtasks() {
    let mut view = View::default(); view.phase = Phase::Locked;
    view.items.push(Item { id: "a".into(), title: "allowed".into(), date: "".into(), time: "".into(), done: false, priority: Some(3), focus: Some(true), subtasks: Some(vec![Subtask { id: "b".into(), title: "secret".into(), done: false }]) });
    view.sanitize().unwrap(); let json = serde_json::to_string(&view).unwrap();
    assert!(!json.contains("secret")); assert!(!json.contains("subtasks")); assert!(!json.contains("priority"));
    view.phase = Phase::Locking; view.sanitize().unwrap(); assert!(view.items.is_empty());
  }
  #[test]
  fn bounds_support_negative_monitors_and_oversized_windows() {
    assert_eq!(clamp_axis(-2000, -1920, 1920, 360, false, 12), -1920);
    assert_eq!(clamp_axis(-365, -1920, 1920, 360, true, 12), -360);
    assert_eq!(clamp_axis(400, 0, 300, 600, false, 12), 0);
  }
}
