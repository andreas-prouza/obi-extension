// Messages of the deployment config page (deployment_config.ts → DeploymentConfig.ts)
import { Guard, MessageOf, is_plain_object, is_string, is_string_array } from './MessageGuard';


export interface DeploymentConfigData {
  'i-releaser': { url: string; 'default-workflow': string; workflows: string[]; project: string; 'run-stages': string[]; 'main-branch': string; 'auth-token': string };
}

const is_deployment_config: Guard<DeploymentConfigData> = (v): v is DeploymentConfigData => {
  if (!is_plain_object(v) || !is_plain_object(v['i-releaser']))
    return false;
  const ir = v['i-releaser'];
  return is_string(ir['url']) && is_string(ir['default-workflow']) && is_string_array(ir['workflows'])
    && is_string(ir['project']) && is_string_array(ir['run-stages'])
    && is_string(ir['main-branch']) && is_string(ir['auth-token']);
};

export const DEPLOYMENT_CONFIG_REQUESTS = {
  save: { data: is_deployment_config },
  reload: {},
  delete_auth_token: {},
};

export type DeploymentConfigRequest = MessageOf<typeof DEPLOYMENT_CONFIG_REQUESTS>;

