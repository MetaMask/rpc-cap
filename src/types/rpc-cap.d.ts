import {
  JsonRpcEngine,
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import { OcapLdCapability } from './ocap-ld';

export type AuthenticatedJsonRpcMiddleware = (
  domain: OriginMetadata,
  req: JsonRpcRequest<any>,
  res: PendingJsonRpcResponse<any>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
) => void;

/**
 * Used for prompting the user about a proposed new permission.
 * Includes information about the domain granted, as well as the permissions assigned.
 */
export interface PermissionsRequest {
  metadata: PermissionsRequestMetadata;
  permissions: RequestedPermissions;
}

export interface PermissionsRequestMetadata {
  id: string;
  origin: OriginString;
}

export interface OriginMetadata {
  origin: OriginString;
}

/**
 * The format submitted by a domain to request an expanded set of permissions.
 * Assumes knowledge of the requesting domain's context.
 *
 * Uses a map to emphasize that there will ultimately be one set of permissions per domain per method.
 *
 * Is a key-value store of method names, to MethodRequest objects, which have a caveats array.
 */
export interface RequestedPermissions {
  [methodName: string]: MethodRequest;
}

/**
 * Object used to request a given permission within reasonable terms.
 * This can be an empty object, but can also include a caveat array.
 */
type MethodRequest = Partial<OcapLdCapability>;

export type UserApprovalPrompt = (
  permissionsRequest: PermissionsRequest,
) => Promise<RequestedPermissions>;

export interface RpcCapDomainEntry {
  permissions: OcapLdCapability[];
}

type OriginString = string;

export interface CapabilitiesConfig {
  requestUserApproval: UserApprovalPrompt;
  engine?: JsonRpcEngine;
  initState?: CapabilitiesConfig;
  methodPrefix?: string;
  restrictedMethods?: RestrictedMethodMap;
  safeMethods?: string[];
}

interface RpcCapDomainRegistry {
  [domain: string]: RpcCapDomainEntry;
}

export interface CapabilitiesState {
  domains: RpcCapDomainRegistry;
}

export interface RestrictedMethodEntry<T, U> {
  description: string;
  method: PermittedJsonRpcMiddleware<T, U>;
}

export interface PermittedJsonRpcMiddleware<T, U>
  extends JsonRpcMiddleware<T, U> {
  (
    req: JsonRpcRequest<T>,
    res: PendingJsonRpcResponse<U>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
    engine?: JsonRpcEngine,
  ): void;
}

export interface RestrictedMethodMap {
  [key: string]: RestrictedMethodEntry<unknown, unknown>;
}

export interface RpcCapInterface {
  getPermissionsForDomain: (domain: string) => OcapLdCapability[];
  getPermission: (
    domain: string,
    method: string,
  ) => OcapLdCapability | undefined;
  getPermissionsRequests: () => PermissionsRequest[];
  grantNewPermissions(
    domain: string,
    approved: RequestedPermissions,
    res: JsonRpcResponse<any>,
    end: JsonRpcEngineEndCallback,
    granter?: string,
  ): void;
  getDomains: () => RpcCapDomainRegistry;
  setDomains: (domains: RpcCapDomainRegistry) => void;
  getDomainSettings: (domain: string) => RpcCapDomainEntry | undefined;
  getOrCreateDomainSettings: (domain: string) => RpcCapDomainEntry;
  setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
  addPermissionsFor: (
    domainName: string,
    newPermissions: {
      [methodName: string]: OcapLdCapability;
    },
  ) => void;
  removePermissionsFor: (
    domain: string,
    permissionsToRemove: OcapLdCapability[],
  ) => void;
  createBoundMiddleware: <T, U>(
    domain: string,
  ) => PermittedJsonRpcMiddleware<T, U>;
  createPermissionedEngine: (domain: string) => JsonRpcEngine;

  // Injected permissions-handling methods:
  providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
  getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  executeMethod: AuthenticatedJsonRpcMiddleware;
}
