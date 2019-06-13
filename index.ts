/// <reference path="./src/interfaces/json-rpc-2.d.ts" />

import ObservableStore from 'obs-store';
import equal from 'fast-deep-equal';
import uuid from 'uuid/v4';
import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/interfaces/json-rpc-2';
import BaseController from 'gaba/BaseController';

function unauthorized (request?: JsonRpcRequest<any>): JsonRpcError<JsonRpcRequest<any>> {
  const UNAUTHORIZED_ERROR: JsonRpcError<JsonRpcRequest<any>> = {
    message: 'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/json-rpc-capabilities-middleware',
    code: 1,
    data: request,
  };
  return UNAUTHORIZED_ERROR;
}

const METHOD_NOT_FOUND: JsonRpcError<null> = {
  code: -32601,
  message: 'Method not found',
};

const INVALID_REQUEST: JsonRpcError<null> = {
  code: -32602,
  message: 'Invalid request.'
}

// TODO: This error code needs standardization:
const USER_REJECTED_ERROR: JsonRpcError<null> = {
  code: 5,
  message: 'User rejected the request.',
};

type JsonRpcEngineEndCallback = (error?: JsonRpcError<any>) => void;
type JsonRpcEngineNextCallback = (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void;

interface JsonRpcMiddleware {
  (
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ) : void;
}

interface AuthenticatedJsonRpcMiddleware {
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
interface IPermissionsRequest {
  origin: string;
  metadata: IOriginMetadata ;
  options: IRequestedPermissions;
}

interface IOriginMetadata {
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
interface IRequestedPermissions { [methodName: string]: IMethodRequest }

type IMethodRequest = {
  caveats?: RpcCapCaveat[];
};

interface UserApprovalPrompt {
  (permissionsRequest: IPermissionsRequest): Promise<IRequestedPermissions>;
}

interface RpcCapCaveat {
  type: string;
  value?: any;
}

interface RpcCapDomainEntry {
  permissions?: RpcCapPermission[];
}

type IOriginString = string;

/**
 * The schema used to serialize an assigned permission for a method to a domain.
 */
interface RpcCapPermission extends IMethodRequest {
  method?: string;
  id?: string;
  date?: number;
  granter?: IOriginString;
}

interface CapabilitiesConfig {
  safeMethods?: string[];
  restrictedMethods?: RestrictedMethodMap;
  initState?: CapabilitiesConfig;
  methodPrefix?: string;
  requestUserApproval: UserApprovalPrompt;
}

type RpcCapDomainRegistry = { [domain:string]: RpcCapDomainEntry };

interface CapabilitiesState {
  domains: RpcCapDomainRegistry;
}

interface RestrictedMethodEntry {
  description: string;
  method: JsonRpcMiddleware;
} 

interface RestrictedMethodMap {
  [key: string]: RestrictedMethodEntry;
}

interface RpcCapInterface {
  getPermissionsForDomain: (domain: string) => RpcCapPermission[];
  getPermission: (domain: string, method: string) => RpcCapPermission | undefined;
  getPermissionUnTraversed: (domain:string, method:string, granter?: string) => RpcCapPermission | undefined;
  getPermissions: () => RpcCapPermission[];
  getPermissionsRequests: () => IPermissionsRequest[];
  grantNewPermissions (domain: string, approved: IRequestedPermissions, res: JsonRpcResponse<any>, end: JsonRpcEngineEndCallback, granter?: string): void;
  getDomains: () => RpcCapDomainRegistry;
  setDomains: (domains: RpcCapDomainRegistry) => void;
  getDomainSettings: (domain: string) => RpcCapDomainEntry;
  setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
  addPermissionsFor: (domainName: string, newPermissions: RpcCapPermission[]) => void;
  removePermissionsFor: (domain: string, permissionsToRemove: RpcCapPermission[]) => void;

  // Injected permissions-handling methods:
  providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
  getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  grantPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  revokePermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
  executeMethod: AuthenticatedJsonRpcMiddleware;
}

export class CapabilitiesController extends BaseController<any, any> implements RpcCapInterface {
  private safeMethods: string[];
  private restrictedMethods: RestrictedMethodMap;
  private requestUserApproval: UserApprovalPrompt;
  private internalMethods: { [methodName: string]: AuthenticatedJsonRpcMiddleware }
  private methodPrefix: string;
  public memStore: ObservableStore;

  constructor(config: CapabilitiesConfig, state?: Partial<CapabilitiesState>) {
    super(config, state || {});

    this.safeMethods = config.safeMethods || [];
    this.restrictedMethods = config.restrictedMethods || {};
    this.methodPrefix = config.methodPrefix || '';

    if (!config.requestUserApproval) {
      throw "User approval prompt required.";
    }
    this.requestUserApproval = config.requestUserApproval;

    this.defaultState = {
      permissionsRequests: [],
      permissionsDescriptions: Object.keys(this.restrictedMethods).map((methodName) => {
        return {
          method: methodName,
          description: this.restrictedMethods[methodName].description,
        };
      }),
    }

    this.internalMethods = {};
    this.internalMethods[`${this.methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}grantPermissions`] = this.grantPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}revokePermissions`] = this.revokePermissionsMiddleware.bind(this);

    this.initialize();
  }

  serialize () {
    return this.state;
  }

  /**
   * Returns a nearly json-rpc-engine compatible method.
   * The one difference being the first argument should be
   * a unique string identifying the requesting agent/entity,
   * referred to as `domain` in the code. This allows the function to be curried and converted into a normal json-rpc-middleware function.
   */
  providerMiddlewareFunction (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: JsonRpcEngineEndCallback,
  ) : void {
    const methodName = req.method;

    // skip registered safe/passthrough methods.
    if (this.safeMethods.includes(methodName)) {
      return next();
    }

    // handle internal methods before any restricted methods.
    if (Object.keys(this.internalMethods).includes(methodName)) {
      return this.internalMethods[methodName](domain, req, res, next, end);
    }

    // Traverse any permission delegations
    let permission;
    try {
      permission = this.getPermission(domain.origin, methodName);
    } catch (err) {
      res.error = {
        message: err.message,
        code: 1,
      };
      return end(res.error);
    }

    if (!permission) {
      res.error = unauthorized(req);
      return end(res.error);
    }

    this.executeMethod(domain, req, res, next, end);
  }

  executeMethod (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: JsonRpcEngineEndCallback,
  ) : void {
   const methodName = req.method;
    const permission = this.getPermission(domain.origin, methodName);
    if (Object.keys(this.restrictedMethods).includes(methodName)
        && typeof this.restrictedMethods[methodName].method === 'function') {

      // Support static caveat:
      if (permission !== undefined && permission.caveats !== undefined) {
        const statics = permission.caveats.filter(c => c.type === 'static');

        if (statics.length > 0) {
          res.result = statics[statics.length - 1].value;
          return end();
        }
      }

      return this.restrictedMethods[methodName].method(req, res, next, end);
    }

    res.error = METHOD_NOT_FOUND;
    return end(METHOD_NOT_FOUND);
  }

  getPermissionsForDomain (domain: string): RpcCapPermission[] {
    const { domains = {} } = this.state;
    if (Object.keys(domains).includes(domain)) {
      const { permissions } = domains[domain];
      return permissions;
    }
    return [];
  }

  /**
   * Get the parent-most permission granting the requested domain's method permission.
   * Follows the delegation chain of the first matching permission found.
   * 
   * TODO: Enable getPermission for domain and permission id, to extract parent
   * of specific permission.
   * 
   * @param {string} domain - The domain whose permission to retrieve.
   * @param {string} method - The method
   */
  getPermission (domain: string, method: string): RpcCapPermission | undefined {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    const methodFilter = (p: RpcCapPermission) => p.method === method;

    let perm;
    let permissions = this.getPermissionsForDomain(domain).filter(methodFilter);

    while (permissions.length > 0) {
      perm = permissions.shift();
      if (perm !== undefined && perm.granter) {
        permissions = this.getPermissionsForDomain(perm.granter).filter(
          methodFilter
        );
      } else {
        return perm;
      }
    }

    return;
  }

  /**
   * Get the permission for this domain, granter, and method, not following granter links.
   * Returns the first such permission found.
   */
  getPermissionUnTraversed (domain:string, method:string, granter?: string): RpcCapPermission | undefined {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = this.getPermissionsForDomain(domain).filter(p => {
      return p.method === method && (
        (p.granter === undefined && granter === domain) || // own permission
        (p.granter !== undefined && p.granter === granter) // granted permission
      );
    });
    if (permissions.length > 0) { return permissions.shift(); }

    return undefined;
  }

  /*
  * Returns all stored permissions objects.
  */
  getPermissions () {
    const perms = this.state.permissions;
    return perms || [];
  }

  /**
   * Gets current permissions request objects.
   * Useful for displaying information for user consent.
   */
  getPermissionsRequests (): IPermissionsRequest[] {
    const reqs = this.state.permissionsRequests;
    return reqs || [];
  }

  /**
   * Used for removing a permissions request from the permissions request array.
   * 
   * @param request The request that no longer requires user attention.
   */
  removePermissionsRequest (requestId: string) : void {
    const reqs = this.getPermissionsRequests().filter((oldReq) => {
      return oldReq.metadata.id !== requestId;
    })
    this.setPermissionsRequests(reqs);
  }

  setPermissionsRequests (permissionsRequests: IPermissionsRequest[]) {
    this.update({ permissionsRequests });
  }

  /**
   * Used for granting a new set of permissions,
   * after the user has approved it.
   * 
   * @param {string} domain - The domain receiving new permissions.
   * @param {IRequestedPermissions} approvedPermissions - An object of objects describing the granted permissions.
   * @param {JsonRpcResponse} res - The response.
   * @param {JsonRpcEngineEndCallback} end - The end function.
   */
  grantNewPermissions (domain: string, approved: IRequestedPermissions, 
    res: JsonRpcResponse<any>, end: JsonRpcEngineEndCallback, granter?:string) {

    const permissions: RpcCapPermission[] = [];

    for (let method in approved) {
      permissions.push({
        method,
        caveats: approved[method].caveats,
        id: uuid(),
        date: Date.now(),
        granter: granter || 'user', 
      })
    }

    this.addPermissionsFor(domain, permissions);
    res.result = this.getPermissionsForDomain(domain);
    end();
  }

  getDomains () : RpcCapDomainRegistry {
    const { domains } = this.state;
    return domains || {};
  }

  setDomains (domains: RpcCapDomainRegistry) : void {
    this.update({ domains });
  }

  getDomainSettings (domain: string): RpcCapDomainEntry {
    const domains = this.getDomains();

    // Setup if not yet existent:
    if (!(Object.keys(domains).includes(domain))) {
      const newDomain = { permissions: [] };
      domains[domain] = newDomain;
      return newDomain;
    }

    return domains[domain];
  }

  setDomain (domain: IOriginString, domainSettings: RpcCapDomainEntry) {
    const domains = this.getDomains();
    domains[domain] = domainSettings;
    const state = this.state;
    state.domains = domains;
    this.update(state, true);
  }

  /**
   * Adds permissions to the given domain. Overwrites existing identical
   * permissions (same domain, method, and granter). Other existing permissions
   * remain unaffected.
   * 
   * @param {string} domainName - The grantee domain.
   * @param {Array} newPermissions - The unique, new permissions for the grantee domain.
   */
  addPermissionsFor (domainName: string, newPermissions: RpcCapPermission[]) {
    let domain = this.getDomainSettings(domainName);

    if (domain === undefined) {
      domain = { permissions: [] };
    }

    // remove old permissions this will be overwritten
    domain.permissions = domain.permissions.filter((oldPerm: RpcCapPermission) => {
      let isReplaced = false;

      for (let newPerm of newPermissions) {
        if (
          oldPerm.method === newPerm.method &&
          oldPerm.granter === newPerm.granter
        ) {
          isReplaced = true;
          break;
        }
      }
      return !isReplaced;
    })

    // add new permissions
    // TODO: ensure newPermissions only contains unique permissions
    for (let perm of newPermissions) {
      if (!perm.id) {
        perm.id = uuid();
        perm.date = Date.now();
      }
      domain.permissions.push(perm);
    }
    this.setDomain(domainName, domain);
  }

  /**
   * Removes the specified permissions from the given domain.
   * 
   * @param {string} domainName - The domain name whose permissions to remove.
   * @param {Array} permissionsToRemove - Objects identifying the permissions to remove.
   */
  removePermissionsFor (domainName: string, permissionsToRemove: RpcCapPermission[]) {
    const domain = this.getDomainSettings(domainName);

    if (domain === undefined || domain.permissions === undefined) {
      return;
    }

    domain.permissions = domain.permissions.reduce((acc: RpcCapPermission[], perm: RpcCapPermission) => {
      let keep = true;
      for (let r of permissionsToRemove) {
        if (
          r.method === perm.method &&
          r.granter === perm.granter
        ) {
          keep = false;
          break;
        }
      }
      if (keep) { acc.push(perm); }
      return acc;
    }, []);

    this.setDomain(domainName, domain);
  }

  getPermissionsMiddleware (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback)
  {
    const permissions = this.getPermissionsForDomain(domain.origin);
    res.result = permissions;
    end();
  }

  /**
   * The capabilities middleware function used for requesting additional permissions from the user.
   */
  requestPermissionsMiddleware (
    metadata: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: JsonRpcEngineEndCallback,
  ) : void {

    // Validate request
    if (
      req === undefined ||
      req.params[0] === undefined ||
      typeof req.params[0] !== 'object'
    ) {
      res.error = INVALID_REQUEST;
      return end(INVALID_REQUEST);
    }

    if (!metadata.id) {
      metadata.id = uuid();
    }

    const permissions: IRequestedPermissions = req.params[0];
    const requests = this.getPermissionsRequests();

    const permissionsRequest: IPermissionsRequest = {
      origin: metadata.origin,
      metadata,
      options: permissions,
    };

    requests.push(permissionsRequest);
    this.setPermissionsRequests(requests);

    this.requestUserApproval(permissionsRequest)
    // TODO: Allow user to pass back an object describing
    // the approved permissions, allowing user-customization.
    .then((approved: IRequestedPermissions) => {

      if (Object.keys(approved).length === 0) {
        res.error = USER_REJECTED_ERROR;
        return end(USER_REJECTED_ERROR);
      }

      // Delete the request object
      this.removePermissionsRequest(permissionsRequest.metadata.id)

      // If user approval is different, use it as the permissions:
      this.grantNewPermissions(metadata.origin, approved, res, end);
    })
    .catch((reason) => {
      res.error = reason;
      return end(reason);
    });
  }

  grantPermissionsMiddleware (
    metadata: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: JsonRpcEngineEndCallback,
  ) : void {
    const granter: IOriginString = metadata.origin;

    // Validate request
    if (
      req === undefined ||
      req.params[0] === undefined ||
      req.params[1] === undefined ||
      typeof req.params[0] !== 'string' ||
      typeof req.params[1] !== 'object'
    ) {
      res.error = INVALID_REQUEST;
      return end(INVALID_REQUEST);
    }

    // TODO: Allow objects in requestedPerms to specify permission id
    const grantee: IOriginString = req.params[0];
    const requestedPerms: IRequestedPermissions = req.params[1];
    const newlyGranted: RpcCapPermission[] = [];

    let ended = false;
    for (let methodName in requestedPerms) {
      const reqPerm = requestedPerms[methodName];
      if (reqPerm === undefined || methodName === undefined) {
        return;
      }

      const perm = this.getPermission(granter, methodName);
      if (perm) {
        const newPerm: RpcCapPermission = {
          date: Date.now(),
          granter: granter,
          id: uuid(),
          method: methodName,
        };
        if (perm.caveats) { newPerm.caveats = perm.caveats; }
        newlyGranted.push(newPerm);
      } else {
        res.error = unauthorized(req);
        ended = true;
        return end(res.error);
      }
    }

    if (ended) {
      return;
    }

    this.addPermissionsFor(grantee, newlyGranted);
    res.result = newlyGranted;
    end();
  }

  revokePermissionsMiddleware (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: JsonRpcEngineEndCallback,
  ) : void {

    // Validate request
    if (
      req === undefined ||
      req.params[0] === undefined ||
      req.params[1] === undefined ||
      typeof req.params[0] !== 'string' ||
      typeof req.params[1] !== 'object'
    ) {
      res.error = INVALID_REQUEST;
      return end(INVALID_REQUEST);
    }

    const assignedDomain: IOriginString = req.params[0];
    const requestedPerms: IRequestedPermissions = req.params[1];
    const newlyRevoked: RpcCapPermission[] = [];

    let ended = false;

    for (let methodName in requestedPerms) {
      const perm = this.getPermissionUnTraversed(
        assignedDomain, methodName, domain.origin
      );
      if (
            perm && (
              // Grantors can revoke what they have granted:
              (perm.granter && perm.granter === domain.origin) ||
              // Domains can revoke their own permissions:
              (assignedDomain === domain.origin)
            )
          ) {
        newlyRevoked.push(perm);
      } else {
        res.error = unauthorized(req);
        ended = true;
        return end(res.error);
      }
    }

    if (ended) {
      return;
    }

    this.removePermissionsFor(assignedDomain, newlyRevoked);
    res.result = newlyRevoked;
    end();
  }
}

