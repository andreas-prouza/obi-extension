import { spawn, ChildProcess } from "child_process";
import { logger } from '../utilities/Logger';
import { SystemCmdError, UserCancelledError } from '../../shared/Errors';
import { LineSplitter } from './OutputLines';


/** vscode.CancellationToken (structural, so this module needs no vscode import) */
export interface CancelToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => unknown): { dispose(): unknown };
}

export interface SystemCmdOptions {
    /** Every output line, as soon as it arrives */
    on_line?: (line: string, stream: 'stdout' | 'stderr') => void;
    /** Cancelling stops the program (like abort_system_cmd) */
    token?: CancelToken;
    /** Added to the environment of VS Code */
    env?: Record<string, string>;
}


export class SystemCmdExecution {

    static processes: { [key: string]: ChildProcess } = {};
    private static aborted: Set<string> = new Set();


    /**
     * Runs a local program without a shell: every argument reaches the program as it is, so values like
     * source names can't be interpreted as shell syntax. Resolves on exit code 0, rejects with SystemCmdError
     * otherwise, and with UserCancelledError if it was stopped by abort_system_cmd.
     */
    public static async run_system_cmd(cwd: string, command: string, args: string[], id: string, options: SystemCmdOptions = {}): Promise<void> {

        if (SystemCmdExecution.processes[id])
            throw new Error(`Process '${id}' is already running`);
        if (options.token?.isCancellationRequested)
            throw new UserCancelledError(`${id} cancelled`);

        // Use platform-specific shell
        if (process.platform === "win32") {
            cwd = cwd.replace(/%([^%]+)%/g, (_, n) => process.env[n] ?? `%${n}%`);
        }

        // Only for log and error messages
        const cmd = [command, ...args].map(arg => /[\s"']/.test(arg) ? JSON.stringify(arg) : arg).join(' ');

        // POSIX: own process group, so abort_system_cmd can stop the program *and* its children
        logger.info(`${id} | start | cmd: ${cmd}`);
        const env = options.env ? { ...process.env, ...options.env } : undefined;
        const child = spawn(command, args, { cwd: cwd, shell: false, detached: process.platform !== 'win32', env });
        SystemCmdExecution.processes[id] = child;

        return new Promise<void>((resolve, reject) => {

            const lines = { stdout: new LineSplitter(), stderr: new LineSplitter() };
            let settled = false;
            let exit_timer: NodeJS.Timeout | undefined;
            const subscription = options.token?.onCancellationRequested(() => SystemCmdExecution.abort_system_cmd(id));

            // Output after the promise settled is not passed on: callers read their lines after the await
            const emit = (stream: 'stdout' | 'stderr', line: string) => {
                if (!settled)
                    options.on_line?.(line, stream);
            };

            const finish = (error?: Error) => {
                if (settled)
                    return;
                // The last line without a line break, before the caller continues
                lines.stdout.flush().forEach(line => emit('stdout', line));
                lines.stderr.flush().forEach(line => emit('stderr', line));
                settled = true;
                clearTimeout(exit_timer);
                subscription?.dispose();
                delete SystemCmdExecution.processes[id];
                if (SystemCmdExecution.aborted.delete(id)) {
                    logger.info(`${id} | cancelled | cmd: '${cmd}'`);
                    reject(new UserCancelledError(`${id} cancelled`));
                    return;
                }
                if (error) {
                    logger.error(error.message);
                    reject(error);
                    return;
                }
                logger.debug(`System command succeeded: ${id} | cmd: '${cmd}'`);
                resolve();
            };

            const finish_with = (code: number | null, signal: NodeJS.Signals | null) => code === 0
                ? finish()
                : finish(new SystemCmdError(`System command failed: ${id} | exit-code: ${code} | signal: ${signal} | cmd: '${cmd}'`, code, signal));

            child.stdout?.on('data', (data) => {
                logger.debug(`${id} | stdout: ${data}`);
                lines.stdout.push(String(data)).forEach(line => emit('stdout', line));
            });
            child.stderr?.on('data', (data) => {
                // Python logging writes INFO messages to stderr as well
                logger.warn(`${id} | stderr: ${data}`);
                lines.stderr.push(String(data)).forEach(line => emit('stderr', line));
            });

            // 'exit' can come before the last output: settle on 'close', when stdout and stderr are read completely
            child.on('close', (code, signal) => finish_with(code, signal));
            // A process started by the program (own process group) may keep the pipes open: don't wait for it forever
            child.on('exit', (code, signal) => {
                exit_timer = setTimeout(() => {
                    logger.debug(`${id} | output still open ${SystemCmdExecution.CLOSE_AFTER_EXIT_MS} ms after the exit`);
                    finish_with(code, signal);
                    child.stdout?.destroy();
                    child.stderr?.destroy();
                }, SystemCmdExecution.CLOSE_AFTER_EXIT_MS);
            });
            child.on('error', (err) => {
                finish(new SystemCmdError(`System command could not be started: ${id} | error: ${err.message} | cmd: '${cmd}'`, null, null));
            });
        });
    }


    /** How long to wait for the end of the output after the program ended */
    static CLOSE_AFTER_EXIT_MS = 2000;


    /** Stops a running command including all processes it started. */
    public static abort_system_cmd(id: string) {
        const child = SystemCmdExecution.processes[id];
        if (!child || child.pid === undefined)
            return;

        SystemCmdExecution.aborted.add(id);
        try {
            if (process.platform === 'win32')
                spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).on('error', e => logger.warn(`Could not stop ${id} (taskkill): ${e.message}`));
            else
                process.kill(-child.pid, 'SIGTERM');   // negative pid: the whole process group
        }
        catch (e) {
            logger.warn(`Could not stop ${id}: ${e}`);
        }
    }


    /** Stops all running commands (cancel button, deactivation). */
    public static abort_all() {
        Object.keys(SystemCmdExecution.processes).forEach(id => SystemCmdExecution.abort_system_cmd(id));
    }

}
