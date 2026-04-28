export default defineBackground(() => {
  console.log('[Tutti] background started', { id: browser.runtime.id });
});
