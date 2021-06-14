export interface SysExecRetState<R> {
  stdErr: Buffer;
  stdOut: Buffer;
  exitCode: null | number;
  parsedStdOut: null | R;
}

export type SysExecParser<R> = (buf: Buffer) => R;
export type SysExecArgOptions = { quiet: boolean; readTimeout: number };

export type ErrorDetails = {
  originalError?: Error;
  data?: any;
};

export type SysExecErrorArgs = [string, ErrorDetails?];

export type SysExecRetType<P extends (...args: any[]) => any> =
  null | SysExecRetState<ReturnType<P>>;

export type InternalStateType = {
  stderr: Uint8Array[];
  stdout: Uint8Array[];
  lastReadTime: number;
  timeChecksInterval: null | NodeJS.Timeout;
  timeoutKilled: boolean;
};
