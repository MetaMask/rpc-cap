/// <reference path="src/interfaces/json-rpc-2.d.ts" />
import ObservableStore from 'obs-store';
import { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from 'json-rpc-capabilities-middleware/src/interfaces/json-rpc-2';
import BaseController from 'gaba/BaseController';
declare type JsonRpcEngineEndCallback = (error?: JsonRpcError<any>) => void;
interface JsonRpcMiddleware {
    (req: JsonRpcRequest<any[]>, res: JsonRpcResponse<any[]>, next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void, end: JsonRpcEngineEndCallback): void;
}
interface AuthenticatedJsonRpcMiddleware {
    (domain: 'string', req: JsonRpcRequest<any[]>, res: JsonRpcResponse<any[]>, next: (returnFlightCallback?: (res: JsonRpcResponse<any>) => void) => void, end: JsonRpcEngineEndCallback): void;
}
interface UserApprovalPrompt {
    (metadata: Object, permissions: Object[]): Promise<boolean>;
}
interface RpcCapCaveat {
    type: string;
    value?: any;
}
interface RpcCapDomainEntry {
    permissions?: RpcCapPermission[];
}
interface RpcCapPermission {
    method: string;
    id?: string;
    date?: number;
    granter?: string;
    caveats?: RpcCapCaveat[];
}
interface CapabilitiesConfig {
    safeMethods?: string[];
    restrictedMethods?: RestrictedMethodMap;
    initState?: CapabilitiesConfig;
    methodPrefix?: string;
    requestUserApproval: UserApprovalPrompt;
}
declare type RpcCapDomainRegistry = {
    [domain: string]: RpcCapDomainEntry[];
};
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
    providerMiddlewareFunction: AuthenticatedJsonRpcMiddleware;
    executeMethod: AuthenticatedJsonRpcMiddleware;
    getPermissionsForDomain: (domain: string) => RpcCapPermission[];
    getPermission: (domain: string, method: string) => RpcCapPermission;
    getPermissionUnTraversed: (domain: string, method: string, granter?: string) => RpcCapPermission[];
    getPermissions: () => RpcCapPermission[];
    getPermissionsRequests: () => Object[];
    grantNewPermissions: (domain: string, permissions: RpcCapPermission[], res: JsonRpcResponse<any>, end: JsonRpcEngineEndCallback) => void;
    getDomains: () => RpcCapDomainRegistry;
    setDomains: (domains: RpcCapDomainRegistry) => void;
    getDomainSettings: (domain: string) => RpcCapDomainEntry;
    setDomain: (domain: string, settings: RpcCapDomainEntry) => void;
    addPermissionsFor: (domainName: string, newPermissions: RpcCapPermission[]) => void;
    removePermissionsFor: (domain: string, permissionsToRemove: RpcCapPermission[]) => void;
    getPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
    requestPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
    grantPermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
    revokePermissionsMiddleware: AuthenticatedJsonRpcMiddleware;
}
export declare class CapabilitiesController extends BaseController implements RpcCapInterface {
    private safeMethods;
    private restrictedMethods;
    private requestUserApproval;
    private internalMethods;
    private methodPrefix;
    store: ObservableStore;
    memStore: ObservableStore;
    constructor(config: CapabilitiesConfig, state?: Partial<CapabilitiesState>);
    serialize(): any;
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
    providerMiddlewareFunction(domain: any, req: any, res: any, next: any, end: any): any;
    executeMethod(domain: any, req: any, res: any, next: any, end: any): any;
    getPermissionsForDomain(domain: any): any;
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
    getPermission(domain: any, method: any): any;
    /**
     * Get the permission for this domain, granter, and method, not following granter links.
     * Returns the first such permission found.
     */
    getPermissionUnTraversed(domain: any, method: any, granter?: any): any;
    getPermissions(): any;
    /**
     * Gets current permissions request objects.
     * Useful for displaying information for user consent.
     */
    getPermissionsRequests(): any;
    setPermissionsRequests(permissionsRequests: any): void;
    /**
     * Used for granting a new set of permissions,
     * after the user has approved it.
     *
     * @param {string} domain - The domain receiving new permissions.
     * @param {Array} permissions - An array of objects describing the granted permissions.
     * @param {Object} res - The response.
     * @param {function} end - The end function.
     */
    grantNewPermissions(domain: any, permissions: any, res: any, end: any): void;
    getDomains(): any;
    setDomains: (domains: any) => void;
    getDomainSettings(domain: any): any;
    setDomain(domain: any, domainSettings: any): void;
    /**
     * Adds permissions to the given domain. Overwrites existing identical
     * permissions (same domain, method, and granter). Other existing permissions
     * remain unaffected.
     *
     * @param {string} domainName - The grantee domain.
     * @param {Array} newPermissions - The unique, new permissions for the grantee domain.
     */
    addPermissionsFor(domainName: any, newPermissions: any): void;
    /**
     * Removes the specified permissions from the given domain.
     *
     * @param {string} domainName - The domain name whose permissions to remove.
     * @param {Array} permissionsToRemove - Objects identifying the permissions to remove.
     */
    removePermissionsFor(domainName: any, permissionsToRemove: any): void;
    getPermissionsMiddleware(domain: any, req: any, res: any, next: any, end: any): void;
    /**
     * The capabilities middleware function used for requesting additional permissions from the user.
     *
     * @param {Object} req - The JSON RPC formatted request object.
     * @param {Array} req.params - The JSON RPC formatted params array.
     * @param {Object} req.params[0] - An object of the requested permissions.
     */
    requestPermissionsMiddleware(domain: any, req: any, res: any, next: any, end: any): any;
    grantPermissionsMiddleware(granter: any, req: any, res: any, next: any, end: any): void;
    revokePermissionsMiddleware(domain: any, req: any, res: any, next: any, end: any): void;
}
export {};
