import { Constants } from '../shared/Constants';

// Documentation: https://mozilla.github.io/nunjucks/api.html
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nunjucks = require('nunjucks');


interface TemplateEnvironment {
  render(template: string, context: object): string;
  addFilter(name: string, filter: (value: unknown) => unknown): void;
}


function new_environment(folders: string[]): TemplateEnvironment {
  const env: TemplateEnvironment = new nunjucks.Environment(new nunjucks.FileSystemLoader(folders), { autoescape: true });

  env.addFilter('typename', (value: unknown) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    return (value as object).constructor?.name ?? typeof value;
  });
  return env;
}


let default_environment: TemplateEnvironment | undefined;


/**
 * Renders a template of asserts/templates. All pages share one environment and its template cache.
 * `custom_dir`: also look there (the build summary template of a workspace, which can change at any time).
 */
export function render_template(template: string, context: object, custom_dir?: string): string {
  if (custom_dir)
    return new_environment([Constants.HTML_TEMPLATE_DIR, custom_dir]).render(template, context);

  default_environment ??= new_environment([Constants.HTML_TEMPLATE_DIR]);
  return default_environment.render(template, context);
}
