import { mkdir, writeFile } from 'node:fs/promises';

const configPath = new URL('../public/app-config.json', import.meta.url);
const tasksApiUrl = process.env.TASKS_API_URL?.trim() ?? '';

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify({ tasksApiUrl }, null, 2)}\n`,
);
