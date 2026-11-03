// Messages of the views shown without (valid) OBI project (welcome.ts → Welcome.ts, config_invalid.ts → ConfigInvalid.ts)
import { MessageOf } from './MessageGuard';


export const WELCOME_REQUESTS = {
  open_folder: {},
  initialize_folder: {},
  reload_window: {},
};

export type WelcomeRequest = MessageOf<typeof WELCOME_REQUESTS>;


export const CONFIG_INVALID_REQUESTS = {
  initialize_folder: {},
  reload_workspace: {},
  config: {},
};

export type ConfigInvalidRequest = MessageOf<typeof CONFIG_INVALID_REQUESTS>;
