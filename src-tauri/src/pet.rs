use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PetPreferences {
  enabled: bool,
  background: bool,
  reminders: bool,
  character: String,
}

impl Default for PetPreferences {
  fn default() -> Self {
    Self { enabled: false, background: false, reminders: false, character: "nailong".into() }
  }
}

fn available_character(character: &str) -> bool {
  serde_json::from_str::<Vec<String>>(include_str!("../../src/lib/pet/available.json"))
    .is_ok_and(|ids| ids.iter().any(|id| id == character))
}

#[derive(Default)]
pub struct PetState(pub Mutex<PetPreferences>);

#[derive(Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PetPreferencePatch {
  enabled: Option<bool>,
  background: Option<bool>,
  reminders: Option<bool>,
  character: Option<String>,
}

impl PetPreferencePatch {
  fn apply(self, current: &PetPreferences) -> Result<PetPreferences, String> {
    let mut next = current.clone();
    if let Some(value) = self.enabled { next.enabled = value; }
    if let Some(value) = self.background { next.background = value; }
    if let Some(value) = self.reminders { next.reminders = value; }
    if let Some(value) = self.character {
      if !available_character(&value) { return Err("此角色尚不可用".into()); }
      next.character = value;
    }
    Ok(next)
  }
}

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

fn reset_axis(origin: i32, available: u32, window: u32, margin: u32) -> i32 {
  let offset = available.saturating_sub(window).saturating_sub(margin);
  (i64::from(origin) + i64::from(offset)).clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

pub fn reset_position(app: &tauri::AppHandle) -> Result<(), String> {
  let pet = app.get_webview_window("pet").ok_or("玩偶窗口尚未就绪")?;
  if let Some(monitor) = pet.primary_monitor().map_err(|e| e.to_string())? {
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let current_scale = pet.scale_factor().map_err(|e| e.to_string())?;
    let logical_size = pet.outer_size().map_err(|e| e.to_string())?.to_logical::<f64>(current_scale);
    let target_size = logical_size.to_physical::<u32>(scale);
    let margin = (20.0 * scale).round() as u32;
    pet.set_position(tauri::PhysicalPosition::new(
      reset_axis(area.position.x, area.size.width, target_size.width, margin),
      reset_axis(area.position.y, area.size.height, target_size.height, margin),
    )).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let mut preferences: PetPreferences = app.path().app_config_dir().ok()
    .and_then(|dir| std::fs::read(dir.join("desktop-pet.json")).ok())
    .and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
  if !available_character(&preferences.character) { preferences.character = "nailong".into(); }
  *app.state::<PetState>().0.lock().unwrap() = preferences;
  tauri::WebviewWindowBuilder::new(app, "pet", tauri::WebviewUrl::App("index.html?pet=1".into()))
    .title("桌面伙伴").inner_size(280.0, 340.0)
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
pub fn pet_configure(app: tauri::AppHandle, preferences: PetPreferencePatch) -> Result<PetPreferences, String> {
  let state = app.state::<PetState>();
  let mut current = state.0.lock().map_err(|e| e.to_string())?;
  let preferences = preferences.apply(&current)?;
  save(&app, &preferences)?;
  *current = preferences.clone();
  let _ = app.emit("pet://preferences", &preferences);
  drop(current);
  refresh(&app);
  Ok(preferences)
}

#[tauri::command]
pub fn pet_home(app: tauri::AppHandle) { super::show_main_window(&app); refresh(&app); }

#[tauri::command]
pub fn pet_reset_position(app: tauri::AppHandle) -> Result<(), String> {
  reset_position(&app)?;
  app.emit_to("pet", "pet://position-reset", ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn independent_window_patches_preserve_other_settings() {
    let current = PetPreferences::default();
    let enabled = PetPreferencePatch { enabled: Some(true), ..Default::default() }.apply(&current).unwrap();
    let background = PetPreferencePatch { background: Some(true), ..Default::default() }.apply(&enabled).unwrap();
    assert!(background.enabled && background.background);
    let disabled = PetPreferencePatch { enabled: Some(false), ..Default::default() }.apply(&background).unwrap();
    assert!(!disabled.enabled && disabled.background);
    assert!(PetPreferencePatch { character: Some("unknown".into()), ..Default::default() }.apply(&disabled).is_err());
  }

  #[test]
  fn legacy_preferences_keep_existing_flags() {
    let preferences: PetPreferences = serde_json::from_str(r#"{"enabled":true,"background":true,"reminders":false}"#).unwrap();
    assert!(preferences.enabled && preferences.background);
    assert_eq!(preferences.character, "nailong");
    let restored: PetPreferences = serde_json::from_slice(&serde_json::to_vec(&preferences).unwrap()).unwrap();
    assert_eq!(restored.character, "nailong");
  }

  #[test]
  fn only_release_characters_are_selectable() {
    assert!(available_character("nailong"));
    assert!(available_character("repairer-clap-sample"));
    assert!(available_character("rounded-robot"));
    assert!(available_character("little-astronaut"));
    assert!(available_character("curly-haired-boy"));
    assert!(!available_character("unknown"));
    assert!(!available_character(""));
  }

  #[test]
  fn reset_position_respects_work_area_and_expanded_window() {
    assert_eq!(reset_axis(0, 1920, 280, 20), 1620);
    assert_eq!(reset_axis(-1920, 1920, 472, 20), -492);
    assert_eq!(reset_axis(0, 2560, 708, 30), 1822);
    assert_eq!(reset_axis(100, 200, 420, 30), 100);
    assert_eq!(reset_axis(-200, 430, 420, 30), -200);
    assert_eq!(reset_axis(i32::MAX, u32::MAX, 1, 1), i32::MAX);
  }
}
