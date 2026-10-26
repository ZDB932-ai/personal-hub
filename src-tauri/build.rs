fn main() {
  let manifest = tauri_build::AppManifest::new().commands(&[
    "todo_connect", "todo_publish", "todo_read", "todo_configure", "todo_reset_position",
    "todo_submit", "todo_work", "todo_resolve", "todo_home", "todo_activity",
    "todo_heartbeat", "todo_disconnect", "todo_finish_quit", "todo_cancel_quit",
    "todo_window_bounds", "todo_set_window_bounds",
    "pet_preferences", "pet_configure", "pet_home", "pet_reset_position",
  ]);
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("failed to build application permissions")
}
