export class DirTool {

  public static get_dir_list(dir: string): string[] {
    const fs = require('fs');

    const files = fs.readdirSync(dir);

    return files;
  }


  public static pathExists(path: string): boolean {
    const fs = require('fs');
    try {
      fs.accessSync(path);
    } catch (err) {
      return false;
    }
    return true;
  }

  public static is_file(path: string): boolean {
    const fs = require('fs');
    const stats = fs.statSync(path);
    return stats.isFile()
  }


  public static get_json(path: string) {
    const fs = require("fs"); 
    
    let json_string = fs.readFileSync(path);
    // Converting to JSON 
    return JSON.parse(json_string);
  }
}