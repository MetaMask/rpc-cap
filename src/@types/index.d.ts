/// <reference path="./ocap-ld.d.ts" />

import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-engine';
import { IOcapLdCapability, IOcapLdCaveat } from './ocap-ld';
import { JsonRpcMiddleware, JsonRpcEngineEndCallback, JsonRpcEngineNextCallback } from "json-rpc-engine";

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
  permissions: IRequestedPermissions;
}

export interface IOriginMetadata {
  id?: string;
  origin: IOriginString;
  site?: {
    name?: string,
    icon?: any,
  }
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

/**
 * Object used to request a given permission within reasonable terms.
 * This can be an empty object, but can also include a caveat array.
 */
type IMethodRequest = Partial<IOcapLdCapability>;

export interface UserApprovalPrompt {
  (permissionsRequest: IPermissionsRequest): Promise<IRequestedPermissions>;
}

export interface RpcCapDomainEntry {
  permissions: IOcapLdCapability[];
}

type IOriginString = string;

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
  getPermissionsForDomain: (domain: string) => IOcapLdCapability[];
  getPermission: (domain: string, method: string) => IOcapLdCapability | undefined;
  getPermissions: () => IOcapLdCapability[];
  getPermissionsRequests: () => IPermissionsRequest[];
  grantNewPermissions (domain: string, approved: IRequestedPermissions, res: JsonRpcResponse<any>, end: JsonRpcEngineEndCallback, granter?: string): void;
  getDomains: () => RpcCapDomainRegistry;
  setDomains: (domains: RpcCapDomainRegistry) => void;
  getDomainSettings: (domain: string) => RpcCapDomainEntry;
  getOrCreateDomainSettings: (domain: string) => RpcCapDomainEntry;
  setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
  addPermissionsFor: (domainName: string, newPermissions: { [methodName: string]: IOcapLdCapability }) => void;
  removePermissionsFor: (domain: string, permissionsToRemove: IOcapLdCapability[]) => void;

  // Injected permissions-handling methods:
  providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
  getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  executeMethod: AuthenticatedJsonRpcMiddleware;
}
