/// <reference path="../@types/json-rpc-engine.d.ts" />
/// <reference path="../@types/is-subset.d.ts" />
import { JsonRpcMiddleware } from "json-rpc-capabilities-middleware/src/@types/json-rpc-engine";
import { isSubset, intersectObjects } from "json-rpc-capabilities-middleware/src/@types/is-subset";
import { unauthorized } from '../errors';
const isSubset = require('is-subset');
const intersectObjects = require('intersect-objects');

interface ISerializedCaveat {
  type: string;
  value?: any;
}

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat:ISerializedCaveat) => ICaveatFunction;

export const filterParams: ICaveatFunctionGenerator = function filterParams(serialized: ISerializedCaveat) {
  const { value } = serialized;
  return (req, res, next, end) => {
    console.log('is calling isSubset of ', req.params, value);
    const permitted = isSubset(req.params, value);

    if (!permitted) {
      res.error = unauthorized(req);
      return end(res.error);
    }

    next();
  }
}

export const filterResponse: ICaveatFunctionGenerator = function filterResponse(serialized: ISerializedCaveat) {
  const { value } = serialized;
  return (_req, res, next, _end) => {

    next((done) => {
      res.result = intersectObjects(res.result, value);
      done();
    });
  }
}
