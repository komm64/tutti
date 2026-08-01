const MISSKEY_UPLOAD_PATH = '/api/drive/files/create';
const MISSKEY_DELETE_PATH = '/api/drive/files/delete';

export function isMisskeyDriveUploadUrl(value) {
  try {
    return new URL(value).pathname === MISSKEY_UPLOAD_PATH;
  } catch {
    return false;
  }
}

export function createMisskeyPreviewUploadTracker(
  context,
  { deleteFiles = deleteMisskeyDriveFiles, warn = console.warn } = {},
) {
  const fileIds = [];
  const pending = new Set();

  const onResponse = (response) => {
    if (!isMisskeyDriveUploadUrl(response.url()) || !response.ok()) return;
    const capture = response.json()
      .then((body) => {
        if (typeof body?.id === 'string' && body.id) fileIds.push(body.id);
      })
      .catch((error) => {
        warn(`[matrix] Misskey upload response capture failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => pending.delete(capture));
    pending.add(capture);
  };
  context.on('response', onResponse);

  return {
    checkpoint: () => fileIds.length,
    async cleanupSince(checkpoint) {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
      const uploadedIds = [...new Set(fileIds.slice(checkpoint))];
      if (uploadedIds.length === 0) {
        return { uploaded: 0, deleted: 0, failures: [] };
      }
      const result = await deleteFiles(context, uploadedIds);
      return { uploaded: uploadedIds.length, ...result };
    },
    dispose() {
      context.off('response', onResponse);
    },
  };
}

export async function deleteMisskeyDriveFiles(context, fileIds) {
  const page = context.pages().find((candidate) => {
    try {
      return new URL(candidate.url()).hostname === 'misskey.io';
    } catch {
      return false;
    }
  });
  if (!page) {
    return {
      deleted: 0,
      failures: fileIds.map((fileId) => ({ fileId, error: 'Misskey page not found' })),
    };
  }

  return await page.evaluate(async ({ ids, deletePath }) => {
    const raw = localStorage.getItem('account');
    const account = raw ? JSON.parse(raw) : null;
    const token = account?.token ?? account?.i;
    if (!token) {
      return {
        deleted: 0,
        failures: ids.map((fileId) => ({ fileId, error: 'Misskey account token not found' })),
      };
    }

    let deleted = 0;
    const failures = [];
    const concurrency = 4;
    for (let offset = 0; offset < ids.length; offset += concurrency) {
      const batch = ids.slice(offset, offset + concurrency);
      const outcomes = await Promise.all(batch.map(async (fileId) => {
        try {
          const response = await fetch(deletePath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ i: token, fileId }),
          });
          if (!response.ok) {
            return { fileId, error: `HTTP ${response.status}` };
          }
          return { fileId };
        } catch (error) {
          return { fileId, error: error instanceof Error ? error.message : String(error) };
        }
      }));
      for (const outcome of outcomes) {
        if (outcome.error) failures.push(outcome);
        else deleted += 1;
      }
    }
    return { deleted, failures };
  }, { ids: fileIds, deletePath: MISSKEY_DELETE_PATH });
}
