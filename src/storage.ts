/**
 * Compatibility facade for extension storage services.
 *
 * Existing callers can continue importing from `src/storage`; responsibility
 * modules own the implementations so callers can migrate independently.
 */

export * from './storage/draft';
export * from './storage/history';
export * from './storage/interactions';
export * from './storage/platform-users';
export * from './storage/settings';
