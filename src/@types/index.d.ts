/// <reference path="./json-rpc-engine.d.ts" />
/// <reference path="./json-rpc-2.d.ts" />
import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/@types/json-rpc-2';
import { JsonRpcMiddleware, JsonRpcEngineEndCallback, JsonRpcEngineNextCallback } from "json-rpc-capabilities-middleware/src/@types/json-rpc-engine";

export interface AuthenticatedJsonRpcMiddleware {
  (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ) : void;
}

/**
 * Used for prompting the user about a proposed new permission.
 * Includes information about the domain granted, as well as the permissions assigned.
 */
export interface IPermissionsRequest {
  origin: string;
  metadata: IOriginMetadata ;
  options: IRequestedPermissions;
}

export interface IOriginMetadata {
  id: string;
  origin: IOriginString;
  siteTitle?: string,
}

/**
 * The format submitted by a domain to request an expanded set of permissions.
 * Assumes knowledge of the requesting domain's context.
 * 
 * Uses a map to emphasize that there will ultimately be one set of permissions per domain per method.
 * 
 * Is a key-value store of method names, to IMethodRequest objects, which have a caveats array.
 */
export interface IRequestedPermissions { [methodName: string]: IMethodRequest }

type IMethodRequest = {
  caveats?: ISerializedCaveat[];
};

export interface UserApprovalPrompt {
  (permissionsRequest: IPermissionsRequest): Promise<IRequestedPermissions>;
}

export interface ISerializedCaveat {
  type: string;
  value?: any;
}

export interface RpcCapDomainEntry {
  permissions: RpcCapPermission[];
}

type IOriginString = string;

/**
 * The schema used to serialize an assigned permission for a method to a domain.
 * 
 * Optionally implements the ocap-ld schema:
 * https://w3c-ccg.github.io/ocap-ld/
 */
export interface RpcCapPermission extends IMethodRequest {
  "@context": string[];
  id: string;
  parentCapability: string;
  invoker: IOriginString;
  date?: number;
  caveats?: ISerializedCaveat[];
}

export interface CapabilitiesConfig {
  safeMethods?: string[];
  restrictedMethods?: RestrictedMethodMap;
  initState?: CapabilitiesConfig;
  methodPrefix?: string;
  requestUserApproval: UserApprovalPrompt;
}

type RpcCapDomainRegistry = { [domain:string]: RpcCapDomainEntry };

export interface CapabilitiesState {
  domains: RpcCapDomainRegistry;
}

export interface RestrictedMethodEntry {
  description: string;
  method: JsonRpcMiddleware;
} 

export interface RestrictedMethodMap {
  [key: string]: RestrictedMethodEntry;
}

export interface RpcCapInterface {
  getPermissionsForDomain: (domain: string) => RpcCapPermission[];
  getPermission: (domain: string, method: string) => RpcCapPermission | undefined;
  getPermissions: () => RpcCapPermission[];
  getPermissionsRequests: () => IPermissionsRequest[];
  grantNewPermissions (domain: string, approved: IRequestedPermissions, res: JsonRpcResponse<any>, end: JsonRpcEngineEndCallback, granter?: string): void;
  getDomains: () => RpcCapDomainRegistry;
  setDomains: (domains: RpcCapDomainRegistry) => void;
  getDomainSettings: (domain: string) => RpcCapDomainEntry;
  getOrCreateDomainSettings: (domain: string) => RpcCapDomainEntry;
  setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
  addPermissionsFor: (domainName: string, newPermissions: { [methodName: string]: RpcCapPermission }) => void;
  removePermissionsFor: (domain: string, permissionsToRemove: RpcCapPermission[]) => void;

  // Injected permissions-handling methods:
  providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
  getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  executeMethod: AuthenticatedJsonRpcMiddleware;
}