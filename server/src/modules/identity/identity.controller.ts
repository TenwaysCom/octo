import { resolveIdentity } from "../../application/services/identity-resolution.service.js";
import {
  validateIdentityResolveRequest,
  type IdentityResolveRequest,
} from "./identity.dto.js";

export async function resolveIdentityController(input: unknown) {
  const request: IdentityResolveRequest = validateIdentityResolveRequest(input);
  return resolveIdentity(request);
}
