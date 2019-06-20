/// <reference path="./@types/json-rpc-engine.d.ts" />
/// <reference path="./@types/is-subset.d.ts" />
import { JsonRpcMiddleware } from "json-rpc-capabilities-middleware/src/@types/json-rpc-engine";
import { isSubset } from "json-rpc-capabilities-middleware/src/@types/is-subset";
import { unauthorized } from './errors';
const isSubset = require('is-subset');

interface ISerializedCaveat {
  type: string;
  value?: any;
}

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat:ISerializedCaveat) => ICaveatFunction;

export const filterParams: ICaveatFunctionGenerator = function filterParams(serialized: ISerializedCaveat) {
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
 * Is an MVP caveat for signing in with accounts.
 * Lots of room for enhancement later.
 */
export const filterResponse: ICaveatFunctionGenerator = function filterResponse(serialized: ISerializedCaveat) {
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
