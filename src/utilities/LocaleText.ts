import { ExtensionContext } from "vscode";
import { DirTool } from "./DirTool";
import path from "path";


export interface ILanguageText {
  [key: string] : string
}



// https://www.eliostruyf.com/localization-visual-studio-code-extensions/

export class LocaleText {


  public static localeText: LocaleText|undefined = undefined;

  public current_locale: string;
  private current_lang: ILanguageText|undefined = undefined;
  private default_lang: ILanguageText|undefined = undefined; // english
  private _context: ExtensionContext;


  /**
   *
   */
  private constructor(locale: string, context: ExtensionContext) {
    this.current_locale = locale;
    this.current_lang = DirTool.get_json(path.join(context.extensionPath, `package.nls.${locale}.json`));
    this.default_lang = DirTool.get_json(path.join(context.extensionPath, `package.nls.json`));
    this._context = context;
  }

  
  public static init(locale: string, context: ExtensionContext) {
    LocaleText.localeText = new LocaleText(locale, context);
  }


 
  /**
   * Get text in national language
   * 
   * @param {string} key 
   * @returns {string} Text in national language. If not found `key` gets returned
   */
  public get_Text(key: string): string {

    if (this.current_lang && this.current_lang[key])
      return this.current_lang[key];

    if (this.default_lang && this.default_lang[key])
      return this.default_lang[key];

    if (this.default_lang) {
      this.default_lang[key] = key;
      DirTool.write_file(path.join(this._context.extensionPath, `package.nls.json`), JSON.stringify(this.default_lang, undefined, 2));
    }

    return key;
  }


}