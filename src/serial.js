let tail = Promise.resolve();

export function serial(task) {
  const run = tail.then(task);
  tail = run.catch(() => {});
  return run;
}
