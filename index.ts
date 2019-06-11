/// <reference path="./src/interfaces/json-rpc-2.d.ts" />

import ObservableStore from 'obs-store';
import equal from 'fast-deep-equal';
import uuid from 'uuid/v4';
import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/interfaces/json-rpc-2';
import BaseController, { BaseConfig, BaseState } from 'gaba/BaseController';


const UNAUTHORIZED_ERROR: JsonRpcError<null> = {
  message: 'Unauthorized to perform action',
  code: 1,
};

const METHOD_NOT_FOUND: JsonRpcError<null> = {
  code: -32601,
  message: 'Method not found',
};

// TODO: This error code needs standardization:
const USER_REJECTED_ERROR: JsonRpcError<null> = {
  code: 5,
  message: 'User rejected the request.',
};

interface JsonRpcMiddleware {
  (
    req: JsonRpcRequest<any[]>,
    res: JsonRpcResponse<any[]>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: (error?: JsonRpcError<any>) => void,
  ) : void;
}

interface AuthenticatedJsonRpcMiddleware {
  (
    domain: 'string',
    req: JsonRpcRequest<any[]>,
    res: JsonRpcResponse<any[]>,
    next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void,
    end: (error?: JsonRpcError<any>) => void,
  ) : void;
}

interface UserApprovalPrompt {
  (metadata: Object, permissions: Object[]): Promise<boolean>;
}

interface RpcCapCaveat {
  type: string;
  value?: any;
}

interface RpcCapPermission {
  method: string;
  id?: string;
  date?: number;
  granter?: string;
  caveats?: RpcCapCaveat[];
}

interface CapabilitiesConfig extends BaseConfig {
  safeMethods?: string[];
  restrictedMethods?: RestrictedMethodMap;
  initState?: CapabilitiesConfig;
  methodPrefix?: string;
  requestUserApproval: UserApprovalPrompt;
}

interface CapabilitiesState extends BaseState {
  domains: { [domain:string]: RpcCapPermission[] };
}

interface RestrictedMethodEntry {
  description: string;
  method: JsonRpcMiddleware;
} 

interface RestrictedMethodMap {
  [key: string]: RestrictedMethodEntry;
}

export class CapabilitiesController extends
BaseController<CapabilitiesConfig, CapabilitiesState> {
  private safeMethods: string[];
  private restrictedMethods: RestrictedMethodMap;
  private requestUserApproval: UserApprovalPrompt;
  private internalMethods: { [methodName: string]: AuthenticatedJsonRpcMiddleware }
  private methodPrefix: string;
  public store: ObservableStore;
  public memStore: ObservableStore;

  constructor(config: CapabilitiesConfig, state?: Partial<CapabilitiesState>) {
    super();

    this.safeMethods = config.safeMethods || [];
    this.restrictedMethods = config.restrictedMethods || {};
    this.methodPrefix = config.methodPrefix || '';

    if (!config.requestUserApproval) {
      throw "User approval prompt required.";
    }
    this.requestUserApproval = config.requestUserApproval;

    this.store = Reflect.construct(ObservableStore, [state || {}]);
    this.memStore = Reflect.construct(ObservableStore, [{
      permissionsRequests: [],
      permissionsDescriptions: Object.keys(this.restrictedMethods).map((methodName) => {
        return {
          method: methodName,
          description: this.restrictedMethods[methodName].description,
        };
      }),
    }]);

    this.internalMethods = {};
    this.internalMethods[`${this.methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}grantPermissions`] = this.grantPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}revokePermissions`] = this.revokePermissionsMiddleware.bind(this);
  }

  serialize () {
    return this.store.getState();
  }

  /**
   * Returns a nearly json-rpc-engine compatible method.
   * The one difference being the first argument should be
   * a unique string identifying the requesting agent/entity,
   * referred to as `domain` in the code. This allows the function to be curried and converted into a normal json-rpc-middleware function.
   *
   * @param {string} domain - A unique string representing the requesting entity.
   * @param {Object} req - The JSON-RPC compatible request object.
   * @param {string} req.method - The JSON RPC method being called.
   * @param {Object} res - The JSON RPC compatible response object.
   * @param {callback} next - A function to pass the responsibility of handling the request down the json-rpc-engine middleware stack.
   * @param {callback} end - A function to stop traversing the middleware stack, and reply immediately with the current `res`. Can be passed an Error object to return an error.
   */
  providerMiddlewareFunction (domain, req, res, next, end) {
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
      permission = this.getPermission(domain, methodName);
    } catch (err) {
      res.error = {
        message: err.message,
        code: 1,
      };
      return end(res.error);
    }

    if (!permission) {
      res.error = UNAUTHORIZED_ERROR;
      return end(UNAUTHORIZED_ERROR);
    }

    this.executeMethod(domain, req, res, next, end);
  }

  executeMethod (domain, req, res, next, end) {
    const methodName = req.method;
    const permission = this.getPermission(domain, methodName);
    if (Object.keys(this.restrictedMethods).includes(methodName)
        && typeof this.restrictedMethods[methodName].method === 'function') {

      // Support static caveat:
      if (permission.caveats) {
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

  getPermissionsForDomain (domain) {
    const { domains = {} } = this.store.getState();
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
  private getPermission (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    const methodFilter = p => p.method === method;

    let perm;
    let permissions = this.getPermissionsForDomain(domain).filter(methodFilter);

    while (permissions.length > 0) {
      perm = permissions.shift();
      if (perm.granter) {
        permissions = this.getPermissionsForDomain(perm.granter).filter(
          methodFilter
        );
      } else {
        return perm;
      }
    }

    return undefined;
  }

  /**
   * Get the permission for this domain, granter, and method, not following granter links.
   * Returns the first such permission found.
   */
  getPermissionUnTraversed (domain, method, granter = undefined) {
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

  getPermissions () {
    const perms = this.memStore.getState().permissions;
    return perms || [];
  }

  getPermissionsRequests () {
    const reqs = this.memStore.getState().permissionsRequests;
    return reqs || [];
  }

  setPermissionsRequests (permissionsRequests) {
    this.memStore.updateState({ permissionsRequests });
  }

  /**
   * Used for granting a new set of permissions,
   * after the user has approved it.
   * 
   * @param {string} domain - The domain receiving new permissions.
   * @param {Array} permissions - An array of objects describing the granted permissions.
   * @param {Object} res - The response.
   * @param {function} end - The end function.
   */
  grantNewPermissions (domain, permissions, res, end) {
    // Remove any matching requests from the queue:
    this.setPermissionsRequests(this.getPermissionsRequests().filter((request) => {
      const sameDomain = request.origin === domain;
      let samePerms = false;
      for (let perm of permissions) {
        if (perm.method === request.options.method) {
          samePerms = true;
          break;
        }
      }
      return !(sameDomain && samePerms);
    }));

    // Update the related permission objects:
    this.addPermissionsFor(domain, permissions);
    res.result = this.getPermissionsForDomain(domain);
    end();
  }

  getDomains () {
    const { domains } = this.store.getState();
    return domains || {};
  }

  setDomains = function (domains) {
    this.store.updateState({ domains });
  }

  getDomainSettings (domain) {
    const domains = this.getDomains();

    // Setup if not yet existent:
    if (!(Object.keys(domains).includes(domain))) {
      domains[domain] = { permissions: [] };
    }

    return domains[domain];
  }

  setDomain (domain, domainSettings) {
    const domains = this.getDomains();
    domains[domain] = domainSettings;
    const state = this.store.getState();
    state.domains = domains;
    this.store.putState(state);
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
    const domain = this.getDomainSettings(domainName);

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
  removePermissionsFor (domainName , permissionsToRemove) {
    const domain = this.getDomainSettings(domainName);

    domain.permissions = domain.permissions.reduce((acc, perm) => {
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

  getPermissionsMiddleware (domain, req, res, next, end) {
    const permissions = this.getPermissionsForDomain(domain);
    res.result = permissions;
    end();
  }

  /**
   * The capabilities middleware function used for requesting additional permissions from the user.
   *
   * @param {Object} req - The JSON RPC formatted request object.
   * @param {Array} req.params - The JSON RPC formatted params array.
   * @param {Object} req.params[0] - An object of the requested permissions.
   */
  requestPermissionsMiddleware (domain, req, res, next, end) {
    const metadata = req.metadata || {
      origin: domain,
      siteTitle: domain,
    };

    if (!metadata.id) {
      metadata.id = uuid();
    }

    // TODO: Validate permissions request
    const permissions = req.params[0];
    const requests = this.getPermissionsRequests();
    for (let perm of permissions) {
      requests.push({
        origin: domain,
        metadata,
        options: perm,
      });
    }
    this.setPermissionsRequests(requests);

    if (!this.requestUserApproval) {
      res.result = 'Request submitted, no user approval callback provided.';
      return end();
    }

    this.requestUserApproval(metadata, permissions)
    // TODO: Allow user to pass back an object describing
    // the approved permissions, allowing user-customization.
    .then((approved) => {

      if (!approved) {
        res.error = USER_REJECTED_ERROR;
        return end(USER_REJECTED_ERROR);
      }

      // If user approval is boolean, the request is wholly approved
      if (typeof approved === 'boolean') {
        return this.grantNewPermissions(domain, permissions, res, end);
      }

      // If user approval is different, use it as the permissions:
      this.grantNewPermissions(domain, [approved], res, end);
    })
    .catch((reason) => {
      res.error = reason;
      return end(reason);
    });
  }

  grantPermissionsMiddleware (granter, req, res, next, end) {
    // TODO: Validate params
    // TODO: Allow objects in requestedPerms to specify permission id
    let grantee: string = req.params[0];
    let requestedPerms: RpcCapPermission[] = req.params[1];
    const newlyGranted: RpcCapPermission[] = [];

    // remove duplicates from requestedPerms
    const methodNames = {};
    requestedPerms = requestedPerms.filter(p => {
      if (!methodNames[p.method]) {
        methodNames[p.method] = true;
        return true;
      }
      return false;
    });

    let ended = false;
    requestedPerms.forEach((reqPerm) => {
      const methodName = reqPerm.method;
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
        res.error = UNAUTHORIZED_ERROR;
        ended = true;
        return end(UNAUTHORIZED_ERROR);
      }
    });

    if (ended) {
      return;
    }

    this.addPermissionsFor(grantee, newlyGranted);
    res.result = newlyGranted;
    end();
  }

  revokePermissionsMiddleware (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params;
    const newlyRevoked = [];

    let ended = false;
    requestedPerms.forEach((reqPerm) => {
      const methodName = reqPerm.method;
      const perm = this.getPermissionUnTraversed(
        assignedDomain, methodName, domain
      );
      if (
            perm && (
              // Grantors can revoke what they have granted:
              (perm.granter && perm.granter === domain) ||
              // Domains can revoke their own permissions:
              (assignedDomain === domain)
            )
          ) {
        newlyRevoked.push(perm);
      } else {
        res.error = UNAUTHORIZED_ERROR;
        ended = true;
        return end(UNAUTHORIZED_ERROR);
      }
    });

    if (ended) {
      return;
    }

    this.removePermissionsFor(assignedDomain, newlyRevoked);
    res.result = newlyRevoked;
  }
}

