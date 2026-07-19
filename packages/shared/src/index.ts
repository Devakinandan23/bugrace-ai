export interface ConnectionReadyPayload {
  socketId: string;
  connectedAt: string;
}

export interface ConnectionPingPayload {
  sentAt: string;
}

export interface ConnectionPingAcknowledgement {
  ok: true;
  receivedAt: string;
}

export interface ServerToClientEvents {
  "connection:ready": (payload: ConnectionReadyPayload) => void;
}

export interface ClientToServerEvents {
  "connection:ping": (
    payload: ConnectionPingPayload,
    acknowledge: (response: ConnectionPingAcknowledgement) => void,
  ) => void;
}
