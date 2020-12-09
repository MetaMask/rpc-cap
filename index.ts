/* eslint-disable @typescript-eslint/no-var-requires */

import uuid from 'uuid/v4';

import {
  JsonRpcEngine as IJsonRpcEngine,
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcEngine,
} from 'json-rpc-engine';

import { BaseController } from '@metamask/controllers';

import {
  ICaveatFunction,
  requireParams,
  filterResponse,
  limitResponseLength,
  forceParams,
  ICaveatFunctionGenerator,
} from './src/caveats';

import {
  RpcCapInterface,
  RestrictedMethodMap,
  UserApprovalPrompt,
  AuthenticatedJsonRpcMiddleware,
  CapabilitiesConfig,
  CapabilitiesState,
  IOriginMetadata,
  IPermissionsRequest,
  IRequestedPermissions,
  RpcCapDomainEntry,
  RpcCapDomainRegistry,
  IOriginString,
  PermittedJsonRpcMiddleware,
} from './src/@types';

import {
  unauthorized,
  internalError,
  invalidReq,
  userRejectedRequest,
  methodNotFound,
} from './src/errors';

export type AnnotatedJsonRpcEngine = {
  domain?: IOriginString;
} & JsonRpcEngine;

import { IOcapLdCapability, IOcapLdCaveat } from './src/@types/ocap-ld';

const JsonRpcEngine = require('json-rpc-engine');
const asMiddleware = require('json-rpc-engine/src/asMiddleware');

class Capability implements IOcapLdCapability {
  public '@context': string[] = ['https://github.com/MetaMask/rpc-cap'];
  public parentCapability: string;
  public caveats: IOcapLdCaveat[] | undefined;
  public id: string;
  public date: number;
  public invoker: IOriginString;

  constructor ({ method, caveats, invoker }: {
    method: string;
    caveats?: IOcapLdCaveat[];
    invoker: IOriginString;
  }) {
    this.parentCapability = method;
    this.id = uuid();
    this.date = Date.now();
    this.invoker = invoker;
    if (caveats) {
      this.caveats = caveats;
    }
  }

  toJSON (): IOcapLdCapability {
    return {
      '@context': this['@context'],
      invoker: this.invoker,
      parentCapability: this.parentCapability,
      id: this.id,
      date: this.date,
      caveats: this.caveats,
    };
  }

  toString (): string {
    return JSON.stringify(this.toJSON());
  }
}

export class CapabilitiesController extends BaseController<any, any> implements RpcCapInterface {
  private safeMethods: string[];
  private restrictedMethods: RestrictedMethodMap;
  private requestUserApproval: UserApprovalPrompt;
  private internalMethods: { [methodName: string]: AuthenticatedJsonRpcMiddleware };
  private caveats: { [ name: string]: ICaveatFunctionGenerator } = { requireParams, filterResponse, limitResponseLength, forceParams };
  private methodPrefix: string;
  private engine: JsonRpcEngine | undefined;

  constructor (config: CapabilitiesConfig, state?: Partial<CapabilitiesState>) {
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
        this.restrictedMethods
      ).reduce<{[key: string]: string}>(
        (acc, methodName) => {
          acc[methodName] = this.restrictedMethods[methodName].description;
          return acc;
        },
        {}),
    };

    this.internalMethods = {};
    this.internalMethods[`${this.methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this);
    this.internalMethods[`${this.methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this);

    this.initialize();
  }

  serialize (): any {
    return this.state;
  }

  /**
   * Returns a capabilities middleware function bound to its parent
   * CapabilitiesController object with the given domain as its
   * first argument.
   * @param  {string} domain the domain to bind the middleware to
   */
  createBoundMiddleware (domain: string): PermittedJsonRpcMiddleware {
    return this.providerMiddlewareFunction.bind(this, { origin: domain });
  }

  /**
   * Returns a JsonRpcEngine with a single, bound capabilities middleware with
   * the given domain as its first argument.
   * See createBoundMiddleware for more information.
   * @param  {string} domain the domain to bind the middleware to
   */
  createPermissionedEngine (domain: string): IJsonRpcEngine {
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
  providerMiddlewareFunction (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
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
      res.error = methodNotFound({ methodName, data: req });
      return end(res.error);
    }

    let permission;
    try {
      permission = this.getPermission(domain.origin, methodName);
    } catch (err) {
      // unexpected internal error
      res.error = internalError({ data: err });
      return end(res.error);
    }

    if (!permission) {
      res.error = unauthorized({ data: req });
      return end(res.error);
    }

    this.executeMethod(domain, req, res, next, end);
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
  getMethodKeyFor (method: string): string {
    const managedMethods: string[] = Object.keys(this.restrictedMethods);

    // Return exact matches:
    if (managedMethods.includes(method)) {
      return method;
    }

    const wildCardMethodsWithoutWildCard = managedMethods.reduce<{[key: string]: boolean}>(
      (acc, methodName) => {
        const wildCardMatch = methodName.match(/(.+)\*$/);
        return wildCardMatch ? { ...acc, [wildCardMatch[1]]: true } : acc;
      },
      {});

    // Check for potentially nested namespaces:
    // Ex: wildzone_
    // Ex: eth_plugin_

    const segments = method.split('_');
    let managed = '';

    while (segments.length > 0 && !managedMethods.includes(managed) && !wildCardMethodsWithoutWildCard[managed]) {
      managed += segments.shift() + '_';
    }

    if (managedMethods.includes(managed)) {
      return managed;
    } else if (wildCardMethodsWithoutWildCard[managed]) {
      return managed + '*';
    } else {
      return '';
    }
  }

  executeMethod (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {
    const methodKey = this.getMethodKeyFor(req.method);
    const permission = this.getPermission(domain.origin, req.method);
    if (methodKey && typeof this.restrictedMethods[methodKey].method === 'function') {
      const virtualEngine = this.createVirtualEngineFor(domain);

      // Check for Caveats:
      if (permission?.caveats && permission.caveats.length > 0) {
        const engine: IJsonRpcEngine = new JsonRpcEngine();

        permission.caveats.forEach((serializedCaveat: IOcapLdCaveat) => {
          const caveatFnGens = this.caveats;
          const caveatFnGen: ICaveatFunctionGenerator = caveatFnGens[serializedCaveat.type];
          const caveatFn: ICaveatFunction = caveatFnGen(serializedCaveat);
          engine.push(caveatFn);
        });

        engine.push((req, res, next, end) => {
          return this.restrictedMethods[methodKey].method(req, res, next, end, virtualEngine);
        });

        const middleware: JsonRpcMiddleware = asMiddleware(engine);
        return middleware(req, res, next, end);

      } else {
        return this.restrictedMethods[methodKey].method(req, res, next, end, virtualEngine);
      }
    }

    res.error = methodNotFound({ methodName: req.method, data: req });
    return end(res.error);
  }

  createVirtualEngineFor (domain: IOriginMetadata): AnnotatedJsonRpcEngine {
    const engine: AnnotatedJsonRpcEngine = new JsonRpcEngine();
    engine.push(this.providerMiddlewareFunction.bind(this, domain));

    /**
     * If an engine was provided, it is used as the final step
     * for the middleware provider.
     */
    if (this.engine) {
      engine.push(asMiddleware(this.engine));
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
  getPermissionsForDomain (domain: string): IOcapLdCapability[] {
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
  getPermission (domain: string, method: string): IOcapLdCapability | undefined {
    const permissions = this.getPermissionsForDomain(domain)
      .filter(permission => {
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
  hasPermissions (domain: string): boolean {
    return Boolean(this.state.domains?.[domain]);
  }

  /**
   * Checks whether the given domain has the given permission.
   *
   * @param domain - The domain to check.
   * @param method - The method of the permission to check for.
   * @returns Whether the given domain has the given permission.
   */
  hasPermission (domain: string, method: string): boolean {
    return this.getPermissionsForDomain(domain).some(permission => {
      return permission.parentCapability === method;
    });
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
   * @param requestId The id of the pending permissions request that no longer
   * requires user attention.
   */
  removePermissionsRequest (requestId: string): void {
    const reqs = this.getPermissionsRequests().filter((oldReq) => {
      return oldReq.metadata.id !== requestId;
    });
    this.setPermissionsRequests(reqs);
  }

  setPermissionsRequests (
    permissionsRequests: IPermissionsRequest[]
  ): void {
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
  grantNewPermissions (
    domain: string,
    approved: IRequestedPermissions,
    res: JsonRpcResponse<any>,
    end: JsonRpcEngineEndCallback
  ): void {

    if (!domain || typeof domain !== 'string') {
      res.error = invalidReq(`Invalid domain: '${domain}'.`);
      return end(res.error);
    }

    // Enforce actual approving known methods:
    for (const methodName in approved) {
      if (!this.getMethodKeyFor(methodName)) {
        res.error = methodNotFound({ methodName });
        return end(res.error);
      }
    }

    const permissions: { [methodName: string]: IOcapLdCapability } = {};

    for (const method in approved) {

      const newPerm = new Capability({
        method,
        invoker: domain,
        caveats: approved[method].caveats,
      });

      if (newPerm.caveats && !this.validateCaveats(newPerm.caveats)) {

        res.error = internalError({
          message: 'Invalid caveats.',
          data: newPerm,
        });

        return end(res.error);
      }

      permissions[method] = newPerm;
    }

    this.addPermissionsFor(domain, permissions);
    res.result = this.getPermissionsForDomain(domain);
    end();
  }

  getDomains (): RpcCapDomainRegistry {
    const { domains } = this.state;
    return domains || {};
  }

  setDomains (domains: RpcCapDomainRegistry): void {
    this.update({ domains });
  }

  /**
   * Gets the domain settings for the given IOriginString.
   * Returns a template RpcCapDomainEntry if no entry exists, but does NOT
   * store the settings. That is left to the consumer.
   *
   * @param {IOriginString} domain - The origin string of the domain.
   * @returns {RpcCapDomainEntry} - The settings for the domain.
   */
  getOrCreateDomainSettings (domain: IOriginString): RpcCapDomainEntry {
    const entry = this.getDomainSettings(domain);
    if (entry === undefined) {
      return { permissions: [] };
    } else {
      return entry;
    }
  }

  /**
   * Gets the domain settings for the given IOriginString, or undefined if
   * none exist.
   *
   * @param {IOriginString} domain - The origin string of the domain.
   * @returns {RpcCapDomainEntry | undefined} - The settings for the domain,
   * or undefined if none exist.
   */
  getDomainSettings (domain: IOriginString): RpcCapDomainEntry | undefined {
    return this.getDomains()[domain];
  }

  /**
   * Sets the domain identified by the given IOriginString.
   * If the domain has no permissions, its key will be deleted from the
   * controller's domains.
   *
   * @param {IOriginString} domain - The origin string of the domain.
   * @param {RpcCapDomainEntry} domainSettings - The associated domain settings.
   */
  setDomain (
    domain: IOriginString, domainSettings: RpcCapDomainEntry
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
  addPermissionsFor (
    domainName: string,
    newPermissions: { [methodName: string]: IOcapLdCapability }
  ): void {
    const domain: RpcCapDomainEntry = this.getOrCreateDomainSettings(domainName);
    const newKeys = Object.keys(newPermissions);

    // remove old permissions so that they will be overwritten
    domain.permissions = domain.permissions.filter((oldPerm: IOcapLdCapability) => {
      return !newKeys.includes(oldPerm.parentCapability);
    });

    for (const methodName in newPermissions) {
      domain.permissions.push(newPermissions[methodName]);
    }

    this.setDomain(domainName, domain);
  }

  /**
   * Validates the given caveats (of a single permission).
   * If the caveats have names, they must be unique.
   * Returns true if valid, false otherwise.
   *
   * @param {IOcapLdCaveat[]} - The caveats to validate.
   */
  validateCaveats (caveats: IOcapLdCaveat[]): boolean {

    const seenNames: { [key: string]: boolean } = {};

    for (const c of caveats) {

      if (
        !this.validateCaveat(c) ||
        c.name && seenNames[c.name] // names must be unique
      ) {
        return false;
      }

      // record name if it exists
      if (c.name) {
        seenNames[c.name] = true;
      }
    }
    return true;
  }

  /**
   * Validates the given caveat. Returns true if valid, false otherwise.
   *
   * @param {IOcapLdCaveat} - The caveat to validate.
   */
  validateCaveat (caveat: IOcapLdCaveat): boolean {

    if (
      !caveat || typeof caveat !== 'object' || Array.isArray(caveat) ||
      !caveat.type || typeof caveat.type !== 'string' ||
      caveat.name === '' || // name may be omitted, but not empty
      caveat.name && typeof caveat.name !== 'string'

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
  getCaveats (
    domainName: string,
    methodName: string
  ): IOcapLdCaveat[] | void {

    const perm = this.getPermission(domainName, methodName);
    return perm?.caveats;
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
  getCaveat (
    domainName: string,
    methodName: string,
    caveatName: string
  ): IOcapLdCaveat | void {

    const perm = this.getPermission(domainName, methodName);
    return perm
      ? perm.caveats && perm.caveats.find(c => c.name === caveatName)
      : undefined;
  }

  /**
   * Adds the given caveat to the permission corresponding to the given domain
   * and method. Throws if the domain or method are unrecognized, or in case of
   * a caveat name collision.
   *
   * @param {string} domainName - The grantee domain.
   * @param {string} methodName - The name of the method identifying the permission.
   * @param {IOcapLdCaveat} caveat - The caveat to add.
   */
  addCaveatFor (
    domainName: string,
    methodName: string,
    caveat: IOcapLdCaveat
  ): void {

    // assert caveat is valid
    if (!this.validateCaveat(caveat)) {
      throw internalError({
        message: 'Invalid caveat param. Must be a valid caveat object.',
        data: caveat,
      });
    }

    const perm = this._getPermissionForCaveat(
      domainName, methodName
    );

    const newCaveats =
      perm.caveats
        ? [ ...perm.caveats, caveat ]
        : [caveat]
    ;

    this._validateAndUpdateCaveats(
      domainName, methodName, newCaveats, perm
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
  updateCaveatFor (
    domainName: string,
    methodName: string,
    caveatName: string,
    caveatValue: any
  ): void {

    if (!caveatName || typeof caveatName !== 'string') {
      throw internalError({
        message: 'Invalid caveat param. Must specify a string name.',
        data: caveatName,
      });
    }

    const perm = this._getPermissionForCaveat(
      domainName, methodName
    );

    // get target caveat
    const caveat = perm.caveats && perm.caveats.find(
      c => c.name === caveatName
    );

    // copy over all caveats except the target
    const newCaveats: IOcapLdCaveat[] = [];
    perm.caveats && perm.caveats.forEach(c => {
      if (c.name !== caveatName) {
        newCaveats.push(c);
      }
    });

    // assert that the target caveat exists
    if (!caveat || !perm.caveats) {
      throw internalError({
        message: 'No such caveat exists for the relevant permission.',
        data: caveatName,
      });
    }

    if (typeof caveat.value !== typeof caveatValue) {
      throw internalError({
        message: 'New caveat value is of different type than original.',
        data: { caveat, newValue: caveatValue },
      });
    }

    caveat.value = caveatValue;
    newCaveats.push(caveat);

    this._validateAndUpdateCaveats(
      domainName, methodName, newCaveats, perm
    );
  }

  /**
   * Internal function used in addCaveatFor and updateCaveatFor.
   */
  private _getPermissionForCaveat (
    domainName: string,
    methodName: string
  ): IOcapLdCapability {

    // assert domain already has permission
    const perm = this.getPermission(domainName, methodName);
    if (!perm) {
      throw internalError({
        message: 'No such permission exists for the given domain.',
        data: { domain: domainName, method: methodName },
      });
    }

    return perm;
  }

  /**
   * Internal function used in addCaveatFor and updateCaveatFor.
   */
  private _validateAndUpdateCaveats (
    domainName: string,
    methodName: string,
    newCaveats: IOcapLdCaveat[],
    perm: IOcapLdCapability
  ): void {

    // assert that new caveats are valid
    if (!this.validateCaveats(newCaveats)) {
      throw internalError({
        message: 'The new caveats are jointly invalid.',
        data: newCaveats,
      });
    }

    // construct new permission with new caveat
    const newPermissions: { [methodName: string]: IOcapLdCapability } = {};
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
  removePermissionsFor (
    domainName: string,
    permissionsToRemove: IOcapLdCapability[]
  ): void {
    // returns { permissions: [] } for new domains
    const domain = this.getDomainSettings(domainName);

    if (!domain) {
      return;
    }

    domain.permissions = domain.permissions.filter(
      (perm: IOcapLdCapability) => {
        for (const r of permissionsToRemove) {
          if (r.parentCapability === perm.parentCapability) {
            return false;
          }
        }
        return true;
      }
    );

    this.setDomain(domainName, domain);
  }

  /**
   * Clear all domains (and thereby remove all permissions).
   */
  clearDomains (): void {
    this.setDomains({});
  }

  /**
   * Check if a request to requestPermissionsMiddleware is valid.
   */
  validatePermissionsRequest (req: JsonRpcRequest<any>): void {

    if (
      !req ||
      !Array.isArray(req.params) ||
      typeof req.params[0] !== 'object' ||
      Array.isArray(req.params[0])
    ) {
      throw invalidReq({ data: req });
    }

    const perms: IRequestedPermissions = req.params[0];

    for (const methodName in perms) {

      if (
        perms[methodName].parentCapability !== undefined &&
        methodName !== perms[methodName].parentCapability
      ) {
        throw invalidReq({ data: req });
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
  getPermissionsMiddleware (
    domain: IOriginMetadata,
    _req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    _next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {
    const permissions = this.getPermissionsForDomain(domain.origin);
    res.result = permissions;
    end();
  }

  /**
   * The capabilities middleware function used for requesting additional permissions from the user.
   */
  requestPermissionsMiddleware (
    domain: IOriginMetadata,
    req: JsonRpcRequest<any>,
    res: JsonRpcResponse<any>,
    _next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void {

    try {
      this.validatePermissionsRequest(req);
    } catch (err) {
      res.error = err;
      return end(res.error);
    }

    const id = typeof req.id === 'number' || req.id
      ? req.id.toString()
      : uuid();

    const permissions: IRequestedPermissions = req.params[0];
    const requests = this.getPermissionsRequests();

    const permissionsRequest: IPermissionsRequest = {
      metadata: {
        origin: domain.origin,
        id,
      },
      permissions: permissions,
    };

    requests.push(permissionsRequest);
    this.setPermissionsRequests(requests);

    this.requestUserApproval(permissionsRequest)
      .then((approved: IRequestedPermissions) => {
        if (Object.keys(approved).length === 0) {
          res.error = userRejectedRequest(req);
          return end(res.error);
        }
        this.grantNewPermissions(domain.origin, approved, res, end);
      })
      .catch((reason) => {
        res.error = reason;
        return end(reason);
      })
      .finally(() => {
        // Delete the request object
        this.removePermissionsRequest(permissionsRequest.metadata.id);
      });
  }
}
