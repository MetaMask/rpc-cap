/// <reference path="./@types/is-subset.d.ts" />
/// <reference path="./@types/index.d.ts" />

import { JsonRpcMiddleware } from 'json-rpc-engine';
import { isSubset } from "./@types/is-subset";
import { unauthorized } from './errors';
import { RpcCapExternalMethods } from './@types';
const isSubset = require('is-subset');

interface ISerializedCaveat {
  type: string;
  value?: any;
}

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (
  caveat: ISerializedCaveat, rpcCap: RpcCapExternalMethods, domain: string
) => ICaveatFunction;

/*
 * Filters params shallowly.
 * MVP caveats with lots of room for enhancement later.
 */
export const filterParams: ICaveatFunctionGenerator = function filterParams(
  serialized: ISerializedCaveat
) {
  const { value } = serialized;
  return (req, res, next, end) => {
    const permitted = isSubset(req.params, value);

    if (!permitted) {
      res.error = unauthorized(req);
      return end(res.error);
    }

    next();
  }
}

/*
 * Filters array results shallowly.
 * MVP caveat for signing in with accounts.
 * Lots of room for enhancement later.
 */
export const filterResponse: ICaveatFunctionGenerator = function filterResponse(
  serialized: ISerializedCaveat
) {
  const { value } = serialized;
  return (_req, res, next, _end) => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.filter((item) => {
          return value.includes(item);
        })
      }
      done();
    });
  }
}

// TODO:07-02
// see the caveat value, and understand what it needs (a reference to the perm domain)
// there may exist a cleaner way of doing this, but shipit
export const requirePermissions: ICaveatFunctionGenerator = function requirePermissions(
  serialized: ISerializedCaveat,
  rpcCap: RpcCapExternalMethods,
  domain: string
) {
  const { value } = serialized;
  return (req, res, next, end) => {
    if (rpcCap.hasPermissions(domain, value)) next()
    else {
      // res.error = unauthorized(req)
      res.error = { message: 'requiredPermissions error', code: 1, data: req }
      return end(res.error)
    }
  }
}
