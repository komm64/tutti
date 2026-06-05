#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
await rm(join(__dirname, '..', 'public', '_locales'), { recursive: true, force: true });
