import { JsonRpcMiddleware } from 'json-rpc-engine';
import { IOcapLdCaveat } from './@types/ocap-ld';
import { unauthorized } from './errors';
import isSubset from 'is-subset';
import equal from 'fast-deep-equal';

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat: IOcapLdCaveat) => ICaveatFunction;

export enum CaveatTypes {
  filterResponse = 'filterResponse',
  forceParams = 'forceParams',
  limitResponseLength = 'limitResponseLength',
  requireParamsIsSubset = 'requireParamsIsSubset',
}

export const caveatFunctions = {
  filterResponse,
  forceParams,
  limitResponseLength,
  requireParamsIsSubset,
};

/*
 * Require that the request params are a subset of the caveat value.
 */
export function requireParamsIsSubset (serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (req, res, next, end): void => {
    const permitted = isSubset(req.params, value);

    if (!permitted) {
      res.error = unauthorized({ data: req });
      return end(res.error);
    }

    next();
  };
}

/*
 * Filters array results deeply.
 */
export function filterResponse (serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.filter((item) => {
          const findResult = value.find((v: unknown) => {
            return equal(v, item);
          });
          return findResult !== undefined;
        });
      }
      done();
    });
  };
}

/*
 * Limits array results to a specific integer length.
 */
export function limitResponseLength (serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.slice(0, value);
      }
      done();
    });
  };
}

/*
 * Forces the method to be called with given params.
 */
export function forceParams (serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (req, _, next): void => {
    req.params = Array.isArray(value) ? [ ...value ] : { ...value };
    next();
  };
}
