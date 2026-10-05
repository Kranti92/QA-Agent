type Level = 'INFO' | 'WARN' | 'ERROR' | 'STEP';

const stamp = () => new Date().toISOString();

const emit = (level: Level, msg: string) => {
  const line = `[${level.padEnd(5)}] ${stamp()} ${msg}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
};

export const logger = {
  info:  (msg: string) => emit('INFO', msg),
  warn:  (msg: string) => emit('WARN', msg),
  error: (msg: string) => emit('ERROR', msg),
  /** Narrates a user-visible action, so an HTML report reads like a test case. */
  step:  (msg: string) => emit('STEP', msg),
};
