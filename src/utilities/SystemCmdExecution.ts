import { spawn, ChildProcess } from "child_process";
import { logger } from '../utilities/Logger';


export class SystemCmdExecution {

    static processes: { [key: string]: ChildProcess } = {};


    public static async run_system_cmd(cwd: string, cmd: string, id: string): Promise<void> {

        const child = spawn(cmd, { cwd: cwd, shell: true });
        SystemCmdExecution.processes[id] = child;

        return new Promise<void>((resolve, reject) => {
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