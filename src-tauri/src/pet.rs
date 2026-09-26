use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct PetPreferences {
  enabled: bool,
  background: bool,
  reminders: bool,
}

#[derive(Default)]
pub struct PetState(pub Mutex<PetPreferences>);

fn save(app: &tauri::AppHandle, preferences: &PetPreferences) -> Result<(), String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let bytes = serde_json::to_vec(preferences).map_err(|e| e.to_string())?;
  std::fs::write(dir.join("desktop-pet.json"), bytes).map_err(|e| e.to_string())
}

pub fn refresh(app: &tauri::AppHandle) {
  let preferences = app.state::<PetState>().0.lock().unwrap().clone();
  if let Some(pet) = app.get_webview_window("pet") {
    let foreground = app.get_webview_window("main").is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(true));
    let visible = preferences.enabled && (preferences.background || foreground);
    if visible != pet.is_visible().unwrap_or(false) {
      if visible { let _ = pet.show(); } else { let _ = pet.hide(); }
    }
  }
}

pub fn reset_position(app: &tauri::AppHandle) -> Result<(), String> {
  let pet = app.get_webview_window("pet").ok_or("玩偶窗口尚未就绪")?;
  if let Some(monitor) = pet.primary_monitor().map_err(|e| e.to_string())? {
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    pet.set_position(tauri::PhysicalPosition::new(
      area.position.x + area.size.width as i32 - (300.0 * scale) as i32,
      area.position.y + area.size.height as i32 - (360.0 * scale) as i32,
    )).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let preferences = app.path().app_config_dir().ok()
    .and_then(|dir| std::fs::read(dir.join("desktop-pet.json")).ok())
    .and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
  *app.state::<PetState>().0.lock().unwrap() = preferences;
  tauri::WebviewWindowBuilder::new(app, "pet", tauri::WebviewUrl::App("index.html?pet=1".into()))
    .title("奶龙 · 桌面伙伴").inner_size(280.0, 340.0)
    .decorations(false).transparent(true).shadow(false).resizable(false)
    .always_on_top(true).skip_taskbar(true).focused(false).visible(false).build()?;
  let _ = reset_position(app);
  refresh(app);
  Ok(())
}

#[tauri::command]
pub fn pet_preferences(app: tauri::AppHandle) -> PetPreferences {
  app.state::<PetState>().0.lock().unwrap().clone()
}

#[tauri::command]
pub fn pet_configure(app: tauri::AppHandle, preferences: PetPreferences) -> Result<(), String> {
  save(&app, &preferences)?;
  *app.state::<PetState>().0.lock().unwrap() = preferences.clone();
  refresh(&app);
  app.emit("pet://preferences", preferences).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pet_home(app: tauri::AppHandle) { super::show_main_window(&app); refresh(&app); }

#[tauri::command]
pub fn pet_reset_position(app: tauri::AppHandle) -> Result<(), String> { reset_position(&app) }
