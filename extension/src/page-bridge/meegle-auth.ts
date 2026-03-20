import type {
  MeegleAuthCodeRequest,
  MeegleAuthCodeResponse,
} from "../types/meegle";

export interface MeegleAuthCodeBridge {
  requestAuthCode(
    request: MeegleAuthCodeRequest,
  ): Promise<MeegleAuthCodeResponse | undefined>;
}

export async function requestMeegleAuthCode(
  bridge: MeegleAuthCodeBridge,
  request: MeegleAuthCodeRequest,
): Promise<MeegleAuthCodeResponse | undefined> {
  return bridge.requestAuthCode(request);
}
