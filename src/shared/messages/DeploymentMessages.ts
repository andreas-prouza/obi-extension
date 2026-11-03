// Messages of the deployment pages (deployment_config.ts → DeploymentConfig.ts, i_releaser.ts → I_Releaser.ts)
import { Guard, MessageOf, is_plain_object, is_string } from './MessageGuard';


export interface DeploymentConfigData {
  'i-releaser': { url: string; 'default-workflow': string; 'main-branch': string; 'auth-token': string };
}

const is_deployment_config: Guard<DeploymentConfigData> = (v): v is DeploymentConfigData => {
  if (!is_plain_object(v) || !is_plain_object(v['i-releaser']))
    return false;
  const ir = v['i-releaser'];
  return is_string(ir['url']) && is_string(ir['default-workflow']) && is_string(ir['main-branch']) && is_string(ir['auth-token']);
};

export const DEPLOYMENT_CONFIG_REQUESTS = {
  save: { data: is_deployment_config },
  reload: {},
  delete_auth_token: {},
};

export type DeploymentConfigRequest = MessageOf<typeof DEPLOYMENT_CONFIG_REQUESTS>;


export const I_RELEASER_REQUESTS = {
  open_web_app: {},
};

export type IReleaserRequest = MessageOf<typeof I_RELEASER_REQUESTS>;
