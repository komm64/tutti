/**
 * Browser extension update lifecycle contracts.
 */

export interface ExtensionUpdateState {
  available: boolean;
  version?: string;
  applying?: boolean;
}

export interface GetExtensionUpdateStateMessage {
  type: 'GET_EXTENSION_UPDATE_STATE';
}

export interface ApplyExtensionUpdateMessage {
  type: 'APPLY_EXTENSION_UPDATE';
}

export interface ExtensionUpdateAvailableMessage {
  type: 'EXTENSION_UPDATE_AVAILABLE';
  state: ExtensionUpdateState;
}

export type UpdateMessage =
  | GetExtensionUpdateStateMessage
  | ApplyExtensionUpdateMessage
  | ExtensionUpdateAvailableMessage;
