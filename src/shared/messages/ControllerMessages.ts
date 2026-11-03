// Messages of the OBI Build view (controller.ts → OBIController.ts)
import { MessageOf, is_string } from './MessageGuard';


export const CONTROLLER_REQUESTS = {
  refresh: {},
  run_build: {},
  run_single_build: {},
  show_changes: {},
  show_single_changes: {},
  cancel_running: {},
  // Checked against the existing profiles by Workspace.change_profile
  change_profile: { profile: is_string },
  copy_profile: {},
  delete_current_profile: {},
};

export type ControllerRequest = MessageOf<typeof CONTROLLER_REQUESTS>;
