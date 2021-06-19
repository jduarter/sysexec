import { getThrowableError } from 'throwable-error';
import { getEnhancedPromise, AbortedOp } from '@jduarter/enhanced-promise';

import type { EnhancedPromiseHandlersObjType } from '@jduarter/enhanced-promise';
import type { ChildProcess } from 'child_process';
import type {
  SysExecErrorArgs,
  SysExecRetType,
  SysExecParser,
  ErrorDetails,
  InternalStateType,
  SysExecArgOptions,
} from './types';

const { spawn } = require('child_process');

const TIME_CHECKS_INTERVAL_DEFAULT_MS = 1000;
const SUCCESS_EXIT_CODE = 0;
const SYS_EXEC_DEFAULT_OPTS = { quiet: false, readTimeout: 30000 };

export const SEPlaintextParser = (buf: Buffer): string => buf.toString();

export const SEJsonParser = <R = any>(buf: Buffer): R =>
  JSON.parse(buf.toString());

export const SysExecError = getThrowableError<SysExecErrorArgs>(
  'SysExecError',
  {
    mapperFn: (userMessage: string, details?: ErrorDetails) => ({
      userMessage,
      originalError: details?.originalError || undefined,
      data: details?.data || undefined,
    }),
    extendFrom: AbortedOp,
  },
);

export const SysExecReadTimeoutError = getThrowableError<[string]>(
  'SysExecReadTimeoutError',
  {
    extendFrom: SysExecError,
  },
);

const bindInternalStateToChildProcess = (
  childProcess: ChildProcess,
  streamName: 'stderr' | 'stdout',
  internalStateRef: InternalStateType,
): void => {
  if (streamName in childProcess && childProcess[streamName] !== null) {
    const stream = childProcess[streamName];
    stream &&
      stream.on('data', (data: Buffer) => {
        internalStateRef.lastReadTime = Date.now();
        internalStateRef[streamName].push(data);
      });
  }
};

const onUncaughtErrorHandler = (
  err: Error,
  { reject }: Pick<EnhancedPromiseHandlersObjType<unknown>, 'reject'>,
) =>
  reject(
    err instanceof SyntaxError
      ? 'uncaught exception (probably parser has failed)'
      : 'uncaught exception',
    {
      originalError: err,
    },
  );

const getOnProcessClosedHandler =
  <T, S>(
    {
      rejectIf,
      reject,
      resolve,
    }: Pick<
      EnhancedPromiseHandlersObjType<S>,
      'reject' | 'rejectIf' | 'resolve'
    >,
    {
      parser,
      abortTimerFn,
      getInternalState,
    }: {
      parser: SysExecParser<T>;
      abortTimerFn: () => void;
      getInternalState: () => InternalStateType;
    },
  ) =>
  async (processExitCode: number) => {
    try {
      abortTimerFn();

      const stdOut = Buffer.concat(getInternalState().stdout);
      const stdErr = Buffer.concat(getInternalState().stderr);

      const signalReceived = processExitCode === null;

      rejectIf(
        signalReceived,
        () =>
          getInternalState().timeoutKilled
            ? new SysExecReadTimeoutError(
                'spawned process was killed due to read timeout',
              )
            : new SysExecError(
                'spawned process was killed due to external signal',
              ),
        {},
      );

      const parsedStdOut = parser(stdOut);

      rejectIf(
        processExitCode !== SUCCESS_EXIT_CODE,
        'spawned process returned non-success (' +
          processExitCode.toString() +
          ') exit code',
        {
          details: {
            data: { exitCode: processExitCode, parsedStdOut, stdOut, stdErr },
          },
        },
      );

      const state = {
        exitCode: processExitCode,
        stdOut,
        stdErr,
        parsedStdOut,
      };

      resolve(state as any /* @todo */);
    } catch (err) {
      reject(err);
    }
  };

export const sysExec = async <P extends SysExecParser<any>>(
  cmdName: string,
  cmdArgs: string[],
  parser: P = SEPlaintextParser as P,
  opts: Partial<SysExecArgOptions> = {},
): Promise<SysExecRetType<P>> => {
  const { quiet, readTimeout } = { ...SYS_EXEC_DEFAULT_OPTS, ...opts };

  const internalState: InternalStateType = {
    stderr: [],
    stdout: [],
    lastReadTime: 0,
    timeChecksInterval: null,
    timeoutKilled: false,
  };

  if (quiet) {
    return Promise.resolve(null);
  }

  const childProcess: ChildProcess = spawn(cmdName, cmdArgs);

  if (readTimeout > 0) {
    internalState.lastReadTime = Date.now();

    internalState.timeChecksInterval = setInterval(() => {
      if (Date.now() - internalState.lastReadTime > readTimeout) {
        // sending SIGABRT signal to child process (read timeout reached)
        internalState.timeoutKilled = true;
        childProcess.kill('SIGABRT');
      }
    }, TIME_CHECKS_INTERVAL_DEFAULT_MS);
  }

  const abortTimerFn = () => {
    if (internalState.timeChecksInterval) {
      clearInterval(internalState.timeChecksInterval);
    }
  };

  return getEnhancedPromise<SysExecRetType<P>>(
    ({ rejectIf, resolve, reject }) => {
      rejectIf(
        !childProcess.stdout || !childProcess.stderr,
        'sysExec: spawn() returned NULL std read handlers.',
        {
          post: abortTimerFn,
        },
      );

      bindInternalStateToChildProcess(childProcess, 'stdout', internalState);
      bindInternalStateToChildProcess(childProcess, 'stderr', internalState);

      childProcess.on(
        'close',
        getOnProcessClosedHandler<P, SysExecRetType<P>>(
          { rejectIf, resolve, reject },
          { abortTimerFn, parser, getInternalState: () => internalState },
        ),
      );
    },
    onUncaughtErrorHandler,
    SysExecError,
  );
};
