import { spawn, ChildProcess } from "child_process";
import { logger } from '../utilities/Logger';


export class SystemCmdExecution {

    static processes: { [key: string]: ChildProcess } = {};


    public static async run_system_cmd(cwd: string, cmd: string, id: string): Promise<void> {

        // Use platform-specific shell
        const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
        const child = spawn(cmd, { cwd: cwd, shell: shell });
        SystemCmdExecution.processes[id] = child;

        return new Promise<void>((resolve, reject) => {

            child.stdout.on('data', (data) => {
                const cmd_info = `${id} | cmd: '${cmd}' | stdout: ${data}`;
                logger.debug(cmd_info);
            });
            child.stderr.on('data', (data) => {
                const cmd_info = `${id} | cmd: '${cmd}' | stderr: ${data}`;
                logger.error(cmd_info);
            });

            child.on('exit', (code, signal) => {
                const cmd_info = `${id} | exit-code: ${code} | signal: ${signal} | cmd: '${cmd}'`;
                if (code !== 0) {
                    const error = `System command failed: ${cmd_info}`;
                    logger.error(error);
                    reject(new Error(error));
                }
                logger.debug(`System command succeeded: ${cmd_info}`);
                resolve();
            });
            child.on('error', (err) => {
                const cmd_error = `System command error: ${id} | error: ${err} | cmd: '${cmd}'`;
                logger.error(cmd_error);
                reject(new Error(cmd_error));
            });
        });
    }


    public static abort_system_cmd(id: string) {
        if (SystemCmdExecution.processes[id]) {
            SystemCmdExecution.processes[id].kill();
            delete SystemCmdExecution.processes[id];
        }
    }

}