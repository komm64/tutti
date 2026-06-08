<script lang="ts">
  import { getAdapter } from '../../../src/adapters/registry';
  import { base64ByteLength } from '../../../src/utils/base64';
  import { formatBytes, formatDuration } from '../../../src/utils/formatters';
  import { t } from '../../../src/utils/i18n';
  import type { ImagePreview, PlatformOption, VideoPreview } from '../../../src/popup/types';
  import { MAX_IMAGES } from '../../../src/popup/platforms';
  import type { PlatformId } from '../../../src/messages';

  interface Props {
    text: string;
    posting: boolean;
    images: ImagePreview[];
    imageAlts: string[];
    video: VideoPreview | null;
    trimToS: number | null;
    platforms: PlatformOption[];
    selected: Record<PlatformId, boolean>;
    onTextChange: (value: string) => void;
    onPaste: (e: ClipboardEvent) => void | Promise<void>;
    onMedia: (e: Event) => void | Promise<void>;
    onAltChange: (index: number, value: string) => void;
    onRemoveImage: (index: number) => void;
    onMoveImage: (index: number, delta: -1 | 1) => void;
    onRemoveVideo: () => void;
    onTrimChange: (value: number | null) => void;
  }

  let {
    text,
    posting,
    images,
    imageAlts,
    video,
    trimToS,
    platforms,
    selected,
    onTextChange,
    onPaste,
    onMedia,
    onAltChange,
    onRemoveImage,
    onMoveImage,
    onRemoveVideo,
    onTrimChange,
  }: Props = $props();

  const selectedMaxDurs = $derived(
    video
      ? platforms
          .filter((p) => selected[p.id])
          .map((p) => getAdapter(p.id)?.videoConstraints?.maxDurationS ?? 0)
          .filter((s) => s > 0)
      : [],
  );
  const minMaxDur = $derived(selectedMaxDurs.length > 0 ? Math.min(...selectedMaxDurs) : 0);
  const overDur = $derived(!!video && minMaxDur > 0 && video.durationS > minMaxDur);
</script>

<textarea
  value={text}
  oninput={(e) => onTextChange((e.currentTarget as HTMLTextAreaElement).value)}
  onpaste={onPaste}
  disabled={posting}
  class="w-full h-32 border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
  placeholder={t('textareaPlaceholder')}
></textarea>

<div class="mt-1.5 flex items-center gap-2">
  {#if !video && images.length < MAX_IMAGES}
    <label class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer select-none" class:opacity-40={posting}>
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
      </svg>
      {t('addMedia')}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        class="hidden"
        disabled={posting}
        onchange={onMedia}
      />
    </label>
  {/if}
  {#if images.length > 0}
    <span class="text-xs text-gray-400 ml-auto">{images.length}/{MAX_IMAGES}</span>
  {/if}
</div>

{#if images.length > 0}
  <div class="mt-1.5 space-y-1.5">
    {#each images as img, i}
      <div class="flex items-center gap-1.5">
        <div class="relative w-12 h-12 shrink-0">
          <img src={img.previewUrl} alt={img.name} class="w-12 h-12 object-cover rounded border border-gray-200" />
          <button onclick={() => onRemoveImage(i)} disabled={posting}
            class="absolute -top-1 -right-1 w-4 h-4 bg-gray-600 text-white rounded-full text-xs leading-none flex items-center justify-center hover:bg-gray-800 disabled:opacity-40">×</button>
        </div>
        <input
          type="text"
          value={imageAlts[i] ?? ''}
          oninput={(e) => onAltChange(i, (e.currentTarget as HTMLInputElement).value)}
          placeholder={t('altPlaceholder')}
          title={t('altTooltip')}
          maxlength="1500"
          disabled={posting}
          class="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
        />
        {#if images.length > 1}
          <div class="flex flex-col gap-0 shrink-0">
            <button
              type="button"
              onclick={() => onMoveImage(i, -1)}
              disabled={posting || i === 0}
              title={t('moveUpTooltip')}
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-[10px] px-1"
            >▲</button>
            <button
              type="button"
              onclick={() => onMoveImage(i, +1)}
              disabled={posting || i === images.length - 1}
              title={t('moveDownTooltip')}
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-[10px] px-1"
            >▼</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if video}
  <div class="mt-1.5 flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
    <div class="flex-1 min-w-0">
      <p class="truncate font-medium text-gray-700">{video.name}</p>
      <p class="text-gray-400">{formatDuration(video.durationS)} · {formatBytes(base64ByteLength(video.data))}</p>
      {#if overDur && !trimToS}
        <button
          type="button"
          onclick={() => onTrimChange(minMaxDur)}
          disabled={posting}
          title={t('trimVideoTooltip', String(minMaxDur))}
          class="mt-0.5 text-[10px] text-orange-600 hover:text-orange-700 hover:underline disabled:opacity-40"
        >{t('trimVideoButton', String(minMaxDur))} ✂</button>
      {:else if trimToS}
        <p class="text-[10px] text-orange-600 mt-0.5">
          {t('trimVideoSet', String(trimToS))}
          <button type="button" onclick={() => onTrimChange(null)} class="ml-1 text-gray-400 hover:text-gray-700">{t('trimVideoCancel')}</button>
        </p>
      {/if}
    </div>
    <button onclick={onRemoveVideo} disabled={posting}
      class="shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-40">✕</button>
  </div>
{/if}
