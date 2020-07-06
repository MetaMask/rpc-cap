import {
  JsonRpcEngine,
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
} from 'json-rpc-engine';
import { IOcapLdCapability } from './ocap-ld';

export type AuthenticatedJsonRpcMiddleware = (
  domain: IOriginMetadata,
  req: JsonRpcRequest<any>,
  res: JsonRpcResponse<any>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
) => void;

/**
 * Used for prompting the user about a proposed new permission.
 * Includes information about the domain granted, as well as the permissions assigned.
 */
export interface IPermissionsRequest {
  metadata: IPermissionsRequestMetadata ;
  permissions: IRequestedPermissions;
}

export interface IPermissionsRequestMetadata {
  id: string;
  origin: IOriginString;
}

export interface IOriginMetadata {
  origin: IOriginString;
}

/**
 * The format submitted by a domain to request an expanded set of permissions.
 * Assumes knowledge of the requesting domain's context.
 *
 * Uses a map to emphasize that there will ultimately be one set of permissions per domain per method.
 *
 * Is a key-value store of method names, to IMethodRequest objects, which have a caveats array.
 */
export interface IRequestedPermissions {
  [methodName: string]: IMethodRequest;
}

/**
 * Object used to request a given permission within reasonable terms.
 * This can be an empty object, but can also include a caveat array.
 */
type IMethodRequest = Partial<IOcapLdCapability>;

export type UserApprovalPrompt = (permissionsRequest: IPermissionsRequest) => Promise<IRequestedPermissions>;

export interface RpcCapDomainEntry {
  permissions: IOcapLdCapability[];
}

type IOriginString = string;

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

export interface RestrictedMethodEntry {
  description: string;
  method: PermittedJsonRpcMiddleware;
}

export interface PermittedJsonRpcMiddleware extends JsonRpcMiddleware {
  (req: JsonRpcRequest<any>, res: JsonRpcResponse<any>, next: JsonRpcEngineNextCallback, end: JsonRpcEngineEndCallback, engine?: JsonRpcEngine): void;
}

export interface RestrictedMethodMap {
  [key: string]: RestrictedMethodEntry;
}

export interface RpcCapInterface {
  getPermissionsForDomain: (domain: string) => IOcapLdCapability[];
  getPermission: (domain: string, method: string) => IOcapLdCapability | undefined;
  getPermissionsRequests: () => IPermissionsRequest[];
  grantNewPermissions (
    domain: string,
    approved: IRequestedPermissions,
    res: JsonRpcResponse<any>,
    end: JsonRpcEngineEndCallback,
    granter?: string
  ): void;
  getDomains: () => RpcCapDomainRegistry;
  setDomains: (domains: RpcCapDomainRegistry) => void;
  getDomainSettings: (domain: string) => RpcCapDomainEntry | undefined;
  getOrCreateDomainSettings: (domain: string) => RpcCapDomainEntry;
  setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
  addPermissionsFor: (
    domainName: string,
    newPermissions: {
      [methodName: string]: IOcapLdCapability;
    }
  ) => void;
  removePermissionsFor: (domain: string, permissionsToRemove: IOcapLdCapability[]) => void;
  createBoundMiddleware: (domain: string) => PermittedJsonRpcMiddleware;
  createPermissionedEngine: (domain: string) => JsonRpcEngine;

  // Injected permissions-handling methods:
  providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
  getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  executeMethod: AuthenticatedJsonRpcMiddleware;
}
