import { JsonRpcMiddleware } from 'json-rpc-engine';
import { IOcapLdCaveat } from './@types/ocap-ld';
import { unauthorized } from './errors';
import isSubset from 'is-subset';

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat: IOcapLdCaveat) => ICaveatFunction;

/*
 * Require that the request params match those specified by the caveat value.
 */
export const requireParams: ICaveatFunctionGenerator = function requireParams (serialized: IOcapLdCaveat) {
  const { value } = serialized;
  return (req, res, next, end): void => {
    const permitted = isSubset(req.params, value);

    if (!permitted) {
      res.error = unauthorized({ data: req });
      return end(res.error);
    }

    next();
  };
};

/*
 * Filters array results shallowly.
 */
export const filterResponse: ICaveatFunctionGenerator = function filterResponse (serialized: IOcapLdCaveat) {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.filter((item) => {
          return value.includes(item);
        });
      }
      done();
    });
  };
};

/*
 * Limits array results to a specific integer length.
 */
export const limitResponseLength: ICaveatFunctionGenerator = function limitResponseLength (serialized: IOcapLdCaveat) {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.slice(0, value);
      }
      done();
    });
  };
};

/*
 * Forces the method to be called with given params.
 */
export const forceParams: ICaveatFunctionGenerator = function forceParams (serialized: IOcapLdCaveat) {
  const { value } = serialized;
  return (req, _, next): void => {
    req.params = [ ...value ];
    next();
  };
};
