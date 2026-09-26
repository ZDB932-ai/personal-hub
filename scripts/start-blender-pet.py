import bpy, addon_utils
addon_utils.enable('blender_mcp', default_set=True, persistent=True)
bpy.context.preferences.addons['blender_mcp'].preferences.telemetry_consent = False
bpy.ops.wm.save_userpref()
import blender_mcp
bpy.types.blendermcp_server = blender_mcp.BlenderMCPServer(host='127.0.0.1', port=9876)
bpy.types.blendermcp_server.start()
