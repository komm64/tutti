<script lang="ts">
  import { t } from '../../../src/utils/i18n';

  interface Props {
    autoPost: boolean;
    onChange: (value: boolean) => void;
  }

  let { autoPost, onChange }: Props = $props();
</script>

<label class="mb-1 flex items-center gap-2 px-3 py-2 rounded border cursor-pointer select-none border-gray-200 bg-white">
  <input
    type="checkbox"
    checked={autoPost}
    onchange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
    class="accent-blue-500"
  />
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium leading-tight">
      {t('autoPostLabel')}
      <span
        class="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded align-middle"
        class:bg-blue-200={autoPost}
        class:text-blue-900={autoPost}
        class:bg-gray-200={!autoPost}
        class:text-gray-700={!autoPost}
      >{autoPost ? t('autoPostOn') : t('autoPostOff')}</span>
    </p>
    <p class="text-[11px] text-gray-500 leading-tight mt-0.5">
      {t('autoPostFunctionDesc')}
    </p>
  </div>
</label>
<p
  class="mb-3 text-[11px] leading-tight px-3"
  class:text-blue-700={autoPost}
  class:text-amber-700={!autoPost}
>
  {autoPost ? t('autoPostStateOn') : t('autoPostStateOff')}
</p>
