import { BaseController } from '@metamask/controllers';

import { ethErrors } from 'eth-rpc-errors';

import {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcEngine,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';

import uuid from 'uuid/v4';

import {
  RpcCapInterface,
  RestrictedMethodMap,
  UserApprovalPrompt,
  AuthenticatedJsonRpcMiddleware,
  CapabilitiesConfig,
  CapabilitiesState,
  OriginMetadata,
  PermissionsRequest,
  RequestedPermissions,
  RpcCapDomainEntry,
  RpcCapDomainRegistry,
  OriginString,
  PermittedJsonRpcMiddleware,
} from './src/@types';

import {
  CaveatFunction,
  CaveatFunctionGenerator,
  caveatFunctions,
} from './src/caveats';

import {
  unauthorized,
  userRejectedRequest,
  methodNotFound,
} from './src/errors';

import { OcapLdCapability, OcapLdCaveat } from './src/@types/ocap-ld';

export { CaveatTypes } from './src/caveats';

export type AnnotatedJsonRpcEngine = {
  domain?: OriginString;
} & JsonRpcEngine;

class Capability implements OcapLdCapability {
  public '@context': string[] = ['https://github.com/MetaMask/rpc-cap'];

  public parentCapability: string;

  public caveats: OcapLdCaveat[] | undefined;

  public id: string;

  public date: number;

  public invoker: OriginString;

  constructor({ method, caveats, invoker }: {
    method: string;
    caveats?: OcapLdCaveat[];
    invoker: OriginString;
  }) {
    this.parentCapability = method;
    this.id = uuid();
    this.date = Date.now();
    this.invoker = invoker;
    if (caveats) {
      this.caveats = caveats;
    }
  }

  toJSON(): OcapLdCapability {
    return {
      '@context': this['@context'],
      invoker: this.invoker,
      parentCapability: this.parentCapability,
      id: this.id,
      date: this.date,
      caveats: this.caveats,
    };
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}

export class CapabilitiesController extends BaseController<any, any> implements RpcCapInterface {
  private safeMethods: string[];

  private restrictedMethods: RestrictedMethodMap;

  private requestUserApproval: UserApprovalPrompt;

  private internalMethods: { [methodName: string]: AuthenticatedJsonRpcMiddleware };

  private caveats: { [ name: string]: CaveatFunctionGenerator<any, any> } = { ...caveatFunctions };

  private methodPrefix: string;

  private engine: JsonRpcEngine | undefined;

  constructor(config: CapabilitiesConfig, state?: Partial<CapabilitiesState>) {
    super(config, state || {});

    this.safeMethods = config.safeMethods || [];
    this.restrictedMethods = config.restrictedMethods || {};
    this.methodPrefix = config.methodPrefix || '';
    this.engine = config.engine || undefined;

    if (!config.requestUserApproval) {
      throw new Error('User approval prompt required.');
    }
    this.requestUserApproval = config.requestUserApproval;

    this.defaultState = {
      permissionsRequests: [],
      permissionsDescriptions: Object.keys(
        this.restrictedMethods,
      ).reduce<{[key: string]: string}>(
        (acc, methodName) => {
          acc[methodName] = this.restrictedMethods[methodName].description;
          return acc;
        },
        {},
      ),
    };

    this.internalMethods = {};
    this.internalMethods[`${this.methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this);

    this.initialize();
  }

  serialize(): any {
    return this.state;
  }

  /**
   * Returns a capabilities middleware function bound to its parent
   * CapabilitiesController object with the given domain as its
   * first argument.
   * @param  {string} domain the domain to bind the middleware to
   */
  createBoundMiddleware(domain: string): PermittedJsonRpcMiddleware<unknown, unknown> {
    return this.providerMiddlewareFunction.bind(this, { origin: domain });
  }

  /**
   * Returns a JsonRpcEngine with a single, bound capabilities middleware with
   * the given domain as its first argument.
   * See createBoundMiddleware for more information.
   * @param  {string} domain the domain to bind the middleware to
   */
  createPermissionedEngine(domain: string): JsonRpcEngine {
    const engine = new JsonRpcEngine();
    engine.push(this.createBoundMiddleware(domain));
    return engine;
  }

  /**
   * Returns a nearly json-rpc-engine compatible method.
   * The one difference being the first argument should be
   * a unique string identifying the requesting agent/entity,
   * referred to as `domain` in the code. This allows the function
   * to be curried and converted into a normal json-rpc-middleware function.
   */
  providerMiddlewareFunction(
    domain: OriginMetadata,
    req: JsonRpcRequest<unknown>,
    res: PendingJsonRpcResponse<unknown>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {
    const methodName = req.method;

    // skip registered safe/passthrough methods.
    if (this.safeMethods.includes(methodName)) {
      return next();
    }

    // handle internal methods before any restricted methods.
    if (this.internalMethods[methodName]) {
      return this.internalMethods[methodName](domain, req, res, next, end);
    }

    // if the method also is not a restricted method, the method does not exist
    if (!this.getMethodKeyFor(methodName)) {
      return end(methodNotFound({ methodName, data: req }));
    }

    let permission;
    try {
      permission = this.getPermission(domain.origin, methodName);
    } catch (err) {
      // unexpected internal error
      return end(ethErrors.rpc.internal({ data: err }));
    }

    if (!permission) {
      return end(unauthorized({ data: req }));
    }

    return this.executeMethod(domain, req, res, next, end);
  }

  /**
   * Used for retrieving the key that manages the restricted method
   * associated with the current RPC `method` key.
   *
   * Used to support our namespaced method feature, which allows blocks
   * of methods to be hidden behind a restricted method with a trailing `_` character.
   *
   * @param method string - The requested rpc method.
   * @returns methodKey string
   */
  getMethodKeyFor(method: string): string {
    const managedMethods: string[] = Object.keys(this.restrictedMethods);

    // Return exact matches:
    if (managedMethods.includes(method)) {
      return method;
    }

    const wildCardMethodsWithoutWildCard = managedMethods.reduce<{[key: string]: boolean}>(
      (acc, methodName) => {
        const wildCardMatch = methodName.match(/(.+)\*$/u);
        return wildCardMatch ? { ...acc, [wildCardMatch[1]]: true } : acc;
      },
      {},
    );

    // Check for potentially nested namespaces:
    // Ex: wildzone_
    // Ex: eth_plugin_

    const segments = method.split('_');
    let managed = '';

    while (segments.length > 0 && !managedMethods.includes(managed) && !wildCardMethodsWithoutWildCard[managed]) {
      managed += `${segments.shift()}_`;
    }

    if (managedMethods.includes(managed)) {
      return managed;
    } else if (wildCardMethodsWithoutWildCard[managed]) {
      return `${managed}*`;
    }

    return '';
  }

  executeMethod(
    domain: OriginMetadata,
    req: JsonRpcRequest<any>,
    res: PendingJsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {
    const methodKey = this.getMethodKeyFor(req.method);
    const permission = this.getPermission(domain.origin, req.method);

    if (methodKey && typeof this.restrictedMethods[methodKey].method === 'function') {
      const virtualEngine = this.createVirtualEngineFor(domain);

      // Check for Caveats:
      if (permission?.caveats && permission.caveats.length > 0) {
        const engine: JsonRpcEngine = new JsonRpcEngine();

        permission.caveats.forEach((serializedCaveat: OcapLdCaveat) => {
          const caveatFnGens = this.caveats;
          const caveatFnGen: CaveatFunctionGenerator<unknown, unknown> = caveatFnGens[serializedCaveat.type];
          const caveatFn: CaveatFunction<unknown, unknown> = caveatFnGen(serializedCaveat);
          engine.push(caveatFn);
        });

        engine.push((_req, _res, _next, _end) => {
          return this.restrictedMethods[methodKey].method(_req, _res, _next, _end, virtualEngine);
        });

        const middleware: JsonRpcMiddleware<unknown, unknown> = engine.asMiddleware();
        return middleware(req, res, next, end);

      }

      return this.restrictedMethods[methodKey].method(req, res, next, end, virtualEngine);
    }

    return end(methodNotFound({ methodName: req.method, data: req }));
  }

  createVirtualEngineFor(domain: OriginMetadata): AnnotatedJsonRpcEngine {
    const engine: AnnotatedJsonRpcEngine = new JsonRpcEngine();
    engine.push(this.providerMiddlewareFunction.bind(this, domain));

    /**
     * If an engine was provided, it is used as the final step
     * for the middleware provider.
     */
    if (this.engine) {
      engine.push(this.engine.asMiddleware());
    }

    engine.domain = domain.origin;
    return engine;
  }

  /**
   * Checks the permissions for the given domain, or an empty array.
   *
   * @param domain - The domain whose permissions to retrieve.
   * @returns The permissions for the domain.
   */
  getPermissionsForDomain(domain: string): OcapLdCapability[] {
    const { domains = {} } = this.state;
    if (domains[domain]) {
      const { permissions } = domains[domain];
      return permissions;
    }
    return [];
  }

  /**
   * Get the parent-most permission granting the requested domain's method permission.
   * Follows the delegation chain of the first matching permission found.
   *
   * @param {string} domain - The domain whose permission to retrieve.
   * @param {string} method - The method of the permission to retrieve.
   */
  getPermission(domain: string, method: string): OcapLdCapability | undefined {
    const permissions = this.getPermissionsForDomain(domain)
      .filter((permission) => {
        return permission.parentCapability === method;
      });
    if (permissions.length > 0) {
      return permissions.shift();
    }

    return undefined;
  }

  /**
   * Checks whether the given domain has permissions.
   *
   * @param domain - The domain to check.
   * @returns Whether the given domain has any permissions.
   */
  hasPermissions(domain: string): boolean {
    return Boolean(this.state.domains?.[domain]);
  }

  /**
   * Checks whether the given domain has the given permission.
   *
   * @param domain - The domain to check.
   * @param method - The method of the permission to check for.
   * @returns Whether the given domain has the given permission.
   */
  hasPermission(domain: string, method: string): boolean {
    return this.getPermissionsForDomain(domain).some((permission) => {
      return permission.parentCapability === method;
    });
  }

  /**
   * Gets current permissions request objects.
   * Useful for displaying information for user consent.
   */
  getPermissionsRequests(): PermissionsRequest[] {
    const reqs = this.state.permissionsRequests;
    return reqs || [];
  }

  /**
   * Used for removing a permissions request from the permissions request array.
   *
   * @param requestId The id of the pending permissions request that no longer
   * requires user attention.
   */
  removePermissionsRequest(requestId: string): void {
    const reqs = this.getPermissionsRequests().filter((oldReq) => {
      return oldReq.metadata.id !== requestId;
    });
    this.setPermissionsRequests(reqs);
  }

  setPermissionsRequests(
    permissionsRequests: PermissionsRequest[],
  ): void {
    this.update({ permissionsRequests });
  }

  /**
   * Used for granting a new set of permissions,
   * after the user has approved it.
   *
   * @param {string} domain - The domain receiving new permissions.
   * @param {RequestedPermissions} approvedPermissions - An object of objects describing the granted permissions.
   * @param {JsonRpcResponse} res - The response.
   * @param {JsonRpcEngineEndCallback} end - The end function.
   */
  grantNewPermissions(
    domain: string,
    approved: RequestedPermissions,
    res: PendingJsonRpcResponse<any>,
    end: JsonRpcEngineEndCallback,
  ): void {
    if (!domain || typeof domain !== 'string') {
      return end(ethErrors.rpc.invalidRequest(`Invalid domain: '${domain}'.`));
    }

    // Enforce actual approving known methods:
    for (const methodName in approved) {
      if (!this.getMethodKeyFor(methodName)) {
        return end(methodNotFound({ methodName }));
      }
    }

    const permissions: { [methodName: string]: OcapLdCapability } = {};

    for (const method of Object.keys(approved)) {

      const newPerm = new Capability({
        method,
        invoker: domain,
        caveats: approved[method].caveats,
      });

      if (newPerm.caveats && !this.validateCaveats(newPerm.caveats)) {

        return end(ethErrors.rpc.internal({
          message: 'Invalid caveats.',
          data: newPerm,
        }));
      }

      permissions[method] = newPerm;
    }

    this.addPermissionsFor(domain, permissions);
    res.result = this.getPermissionsForDomain(domain);
    return end();
  }

  getDomains(): RpcCapDomainRegistry {
    const { domains } = this.state;
    return domains || {};
  }

  setDomains(domains: RpcCapDomainRegistry): void {
    this.update({ domains });
  }

  /**
   * Gets the domain settings for the given OriginString.
   * Returns a template RpcCapDomainEntry if no entry exists, but does NOT
   * store the settings. That is left to the consumer.
   *
   * @param {OriginString} domain - The origin string of the domain.
   * @returns {RpcCapDomainEntry} - The settings for the domain.
   */
  getOrCreateDomainSettings(domain: OriginString): RpcCapDomainEntry {
    const entry = this.getDomainSettings(domain);
    if (entry === undefined) {
      return { permissions: [] };
    }
    return entry;

  }

  /**
   * Gets the domain settings for the given OriginString, or undefined if
   * none exist.
   *
   * @param {OriginString} domain - The origin string of the domain.
   * @returns {RpcCapDomainEntry | undefined} - The settings for the domain,
   * or undefined if none exist.
   */
  getDomainSettings(domain: OriginString): RpcCapDomainEntry | undefined {
    return this.getDomains()[domain];
  }

  /**
   * Sets the domain identified by the given OriginString.
   * If the domain has no permissions, its key will be deleted from the
   * controller's domains.
   *
   * @param {OriginString} domain - The origin string of the domain.
   * @param {RpcCapDomainEntry} domainSettings - The associated domain settings.
   */
  setDomain(
    domain: OriginString, domainSettings: RpcCapDomainEntry,
  ): void {
    const domains = this.getDomains();
    if (domainSettings.permissions.length > 0) {
      domains[domain] = domainSettings;
    } else {
      delete domains[domain];
    }
    this.setDomains(domains);
  }

  /**
   * Adds permissions to the given domain. Overwrites existing identical
   * permissions (same domain, and method). Other existing permissions
   * remain unaffected.
   *
   * @param {string} domainName - The grantee domain.
   * @param {Array} newPermissions - The unique, new permissions for the grantee domain.
   */
  addPermissionsFor(
    domainName: string,
    newPermissions: { [methodName: string]: OcapLdCapability },
  ): void {
    const domain: RpcCapDomainEntry = this.getOrCreateDomainSettings(domainName);
    const newKeys = Object.keys(newPermissions);

    // remove old permissions so that they will be overwritten
    domain.permissions = domain.permissions.filter((oldPerm: OcapLdCapability) => {
      return !newKeys.includes(oldPerm.parentCapability);
    });

    for (const methodName of Object.keys(newPermissions)) {
      domain.permissions.push(newPermissions[methodName]);
    }

    this.setDomain(domainName, domain);
  }

  /**
   * Validates the given caveats (of a single permission).
   * If the caveats have names, they must be unique.
   * Returns true if valid, false otherwise.
   *
   * @param {OcapLdCaveat[]} - The caveats to validate.
   */
  validateCaveats(caveats: OcapLdCaveat[]): boolean {
    const seenNames: { [key: string]: boolean } = {};

    for (const caveat of caveats) {

      if (
        !this.validateCaveat(caveat) ||
        (caveat.name && seenNames[caveat.name]) // names must be unique
      ) {
        return false;
      }

      // record name if it exists
      if (caveat.name) {
        seenNames[caveat.name] = true;
      }
    }
    return true;
  }

  /**
   * Validates the given caveat. Returns true if valid, false otherwise.
   *
   * @param {OcapLdCaveat} - The caveat to validate.
   */
  validateCaveat(caveat: OcapLdCaveat): boolean {
    if (
      !caveat ||
      typeof caveat !== 'object' ||
      Array.isArray(caveat) ||
      !(caveat.type in this.caveats) ||
      // name may be omitted, but not empty
      (
        'name' in caveat && (!caveat.name || typeof caveat.name !== 'string')
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Gets all caveats for the permission corresponding to the given domain and
   * method, or undefined if the permission or its caveats does not exist.
   *
   * @param {string} domainName - The grantee domain.
   * @param {string} methodName - The name of the method identifying the permission.
   */
  getCaveats(
    domainName: string,
    methodName: string,
  ): OcapLdCaveat[] | void {
    return this.getPermission(domainName, methodName)?.caveats;
  }

  /**
   * Gets the caveat with the given name for the permission corresponding to the
   * given domain and method, or undefined if the permission or the target
   * caveat does not exist.
   *
   * @param {string} domainName - The grantee domain.
   * @param {string} methodName - The name of the method identifying the permission.
   * @param {string} caveatName - The name of the caveat to retrieve.
   */
  getCaveat(
    domainName: string,
    methodName: string,
    caveatName: string,
  ): OcapLdCaveat | void {
    const perm = this.getPermission(domainName, methodName);
    return perm
      ? perm.caveats?.find((caveat) => caveat.name === caveatName)
      : undefined;
  }

  /**
   * Adds the given caveat to the permission corresponding to the given domain
   * and method. Throws if the domain or method are unrecognized, or in case of
   * a caveat name collision.
   *
   * @param {string} domainName - The grantee domain.
   * @param {string} methodName - The name of the method identifying the permission.
   * @param {OcapLdCaveat} caveat - The caveat to add.
   */
  addCaveatFor(
    domainName: string,
    methodName: string,
    caveat: OcapLdCaveat,
  ): void {
    // assert caveat is valid
    if (!this.validateCaveat(caveat)) {
      throw ethErrors.rpc.internal({
        message: 'Invalid caveat param. Must be a valid caveat object.',
        data: caveat,
      });
    }

    const perm = this._getPermissionForCaveat(
      domainName, methodName,
    );

    const newCaveats =
      perm.caveats
        ? [...perm.caveats, caveat]
        : [caveat];
    this._validateAndUpdateCaveats(
      domainName, methodName, newCaveats, perm,
    );
  }

  /**
   * Updates the value of the caveat with the given name for the permission
   * corresponding to the given domain and method. Throws if the domain
   * or method are unrecognized, or if a caveat with the given name doesn't
   * exist.
   *
   * @param {string} domainName - The grantee domain.
   * @param {string} methodName - The name of the method identifying the permission.
   * @param {string} caveatName - The name of the caveat.
   * @param {any} caveatValue - The new value for the caveat.
   */
  updateCaveatFor(
    domainName: string,
    methodName: string,
    caveatName: string,
    caveatValue: any,
  ): void {
    if (!caveatName || typeof caveatName !== 'string') {
      throw ethErrors.rpc.internal({
        message: 'Invalid caveat param. Must specify a string name.',
        data: caveatName,
      });
    }

    const perm = this._getPermissionForCaveat(
      domainName, methodName,
    );

    // get target caveat
    const targetCaveat = perm.caveats?.find(
      (caveat) => caveat.name === caveatName,
    );

    // copy over all caveats except the target
    const newCaveats: OcapLdCaveat[] = [];
    perm.caveats?.forEach((caveat) => {
      if (caveat.name !== caveatName) {
        newCaveats.push(caveat);
      }
    });

    // assert that the target caveat exists
    if (!targetCaveat || !perm.caveats) {
      throw ethErrors.rpc.internal({
        message: 'No such caveat exists for the relevant permission.',
        data: caveatName,
      });
    }

    if (typeof targetCaveat.value !== typeof caveatValue) {
      throw ethErrors.rpc.internal({
        message: 'New caveat value is of different type than original.',
        data: { caveat: targetCaveat, newValue: caveatValue },
      });
    }

    newCaveats.push({ ...targetCaveat, value: caveatValue });

    this._validateAndUpdateCaveats(
      domainName, methodName, newCaveats, perm,
    );
  }

  /**
   * Internal function used in addCaveatFor and updateCaveatFor.
   */
  private _getPermissionForCaveat(
    domainName: string,
    methodName: string,
  ): OcapLdCapability {
    // assert domain already has permission
    const perm = this.getPermission(domainName, methodName);
    if (!perm) {
      throw ethErrors.rpc.internal({
        message: 'No such permission exists for the given domain.',
        data: { domain: domainName, method: methodName },
      });
    }

    return perm;
  }

  /**
   * Internal function used in addCaveatFor and updateCaveatFor.
   */
  private _validateAndUpdateCaveats(
    domainName: string,
    methodName: string,
    newCaveats: OcapLdCaveat[],
    perm: OcapLdCapability,
  ): void {
    // assert that new caveats are valid
    if (!this.validateCaveats(newCaveats)) {
      throw ethErrors.rpc.internal({
        message: 'The new caveats are jointly invalid.',
        data: newCaveats,
      });
    }

    // construct new permission with new caveat
    const newPermissions: { [methodName: string]: OcapLdCapability } = {};
    perm.caveats = newCaveats;
    newPermissions[methodName] = perm;

    // overwrite the existing permission, completing the update
    this.addPermissionsFor(domainName, newPermissions);
  }

  /**
   * Removes the specified permissions from the given domain.
   *
   * @param {string} domainName - The domain name whose permissions to remove.
   * @param {Array} permissionsToRemove - Objects identifying the permissions to remove.
   */
  removePermissionsFor(
    domainName: string,
    permissionsToRemove: OcapLdCapability[],
  ): void {
    // returns { permissions: [] } for new domains
    const domain = this.getDomainSettings(domainName);

    if (!domain) {
      return;
    }

    domain.permissions = domain.permissions.filter(
      (perm: OcapLdCapability) => {
        for (const r of permissionsToRemove) {
          if (r.parentCapability === perm.parentCapability) {
            return false;
          }
        }
        return true;
      },
    );

    this.setDomain(domainName, domain);
  }

  /**
   * Clear all domains (and thereby remove all permissions).
   */
  clearDomains(): void {
    this.setDomains({});
  }

  /**
   * Check if a request to requestPermissionsMiddleware is valid.
   */
  validatePermissionsRequest(req: JsonRpcRequest<any>): void {
    if (
      !req ||
      !Array.isArray(req.params) ||
      typeof req.params[0] !== 'object' ||
      Array.isArray(req.params[0])
    ) {
      throw ethErrors.rpc.invalidRequest({ data: req });
    }

    const perms: RequestedPermissions = req.params[0];

    for (const methodName of Object.keys(perms)) {
      if (
        perms[methodName].parentCapability !== undefined &&
        methodName !== perms[methodName].parentCapability
      ) {
        throw ethErrors.rpc.invalidRequest({ data: req });
      }

      if (!this.getMethodKeyFor(methodName)) {
        throw methodNotFound({ methodName, data: req });
      }
    }
  }

  /**
   * The capabilities middleware function used for getting permissions for a
   * specific domain.
   */
  getPermissionsMiddleware(
    domain: OriginMetadata,
    _req: JsonRpcRequest<any>,
    res: PendingJsonRpcResponse<any>,
    _next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {
    const permissions = this.getPermissionsForDomain(domain.origin);
    res.result = permissions;
    return end();
  }

  /**
   * The capabilities middleware function used for requesting additional permissions from the user.
   */
  async requestPermissionsMiddleware(
    domain: OriginMetadata,
    req: JsonRpcRequest<any>,
    res: PendingJsonRpcResponse<any>,
    _next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): Promise<void> {
    try {
      this.validatePermissionsRequest(req);
    } catch (error) {
      return end(error);
    }

    const id = typeof req.id === 'number' || req.id
      ? req.id.toString()
      : uuid();

    const permissions: RequestedPermissions = req.params[0];
    const requests = this.getPermissionsRequests();

    const permissionsRequest: PermissionsRequest = {
      metadata: {
        origin: domain.origin,
        id,
      },
      permissions,
    };

    requests.push(permissionsRequest);
    this.setPermissionsRequests(requests);

    try {
      const approved = await this.requestUserApproval(permissionsRequest);
      if (Object.keys(approved).length === 0) {
        return end(userRejectedRequest(req));
      }
      this.grantNewPermissions(domain.origin, approved, res, end);
    } catch (error) {
      return end(error);
    } finally {
      // Delete the request object
      this.removePermissionsRequest(permissionsRequest.metadata.id);
    }
    return undefined;
  }
}
