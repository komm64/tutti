export const INJECT_REQUEST_MODES = [
  'input',
  'drop',
  'text',
  'tumblr-text',
  'tag-list',
  'click',
  'x-post-url',
] as const;

export type InjectRequestMode = (typeof INJECT_REQUEST_MODES)[number];

const injectRequestModes = new Set<string>(INJECT_REQUEST_MODES);

export function decodeInjectRequestMode(value: unknown): InjectRequestMode {
  return typeof value === 'string' && injectRequestModes.has(value)
    ? value as InjectRequestMode
    : 'input';
}

export type InjectRequestHandler<Request, Response> =
  (request: Request) => Response | Promise<Response>;

export type InjectRequestHandlerMap<Request, Response> = {
  [Mode in InjectRequestMode]: InjectRequestHandler<Request, Response>;
};

export async function dispatchInjectRequest<
  Request extends { mode: InjectRequestMode },
  Response,
>(
  request: Request,
  handlers: InjectRequestHandlerMap<Request, Response>,
): Promise<Response> {
  return await handlers[request.mode](request);
}
