let quiet = false;

export function setQuiet(value: boolean): void {
  quiet = value;
}

/** 进度日志统一走 stderr，保证 stdout 可以安全地管道给 jq / 文件 */
export function log(message: string): void {
  if (!quiet) console.error(`[yunxiao-insight] ${message}`);
}

export function warn(message: string): void {
  console.error(`[yunxiao-insight] ⚠️ ${message}`);
}

export function success(message: string): void {
  console.log(`✅ ${message}`);
}
