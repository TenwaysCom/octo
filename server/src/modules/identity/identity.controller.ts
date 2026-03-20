import { resolveIdentity } from "../../application/services/identity-resolution.service";
import {
  validateIdentityResolveRequest,
  type IdentityResolveRequest,
} from "./identity.dto";

export function identityController(input: unknown): ReturnType<typeof resolveIdentity> {
  const request: IdentityResolveRequest = validateIdentityResolveRequest(input);
  return resolveIdentity(request);
}
